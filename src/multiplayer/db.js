import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DB_PATH = process.env.POLITIKUM_DB_PATH || path.resolve('var', 'politikum.sqlite');

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function openDatabase() {
  const dbPath = DEFAULT_DB_PATH;
  ensureDirExists(dbPath);
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      device_id TEXT,
      player_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions(account_id);

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY,
      match_id TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      finished_at INTEGER,
      duration_ms INTEGER,
      app_version TEXT,
      engine_version TEXT,
      num_players INTEGER,
      num_bots INTEGER,
      winner_player_id TEXT,
      winner_name TEXT,
      result_json TEXT
    );

    CREATE TABLE IF NOT EXISTS ratings (
      player_id TEXT PRIMARY KEY,
      rating INTEGER NOT NULL,
      games_played INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ratings_updated_at ON ratings(updated_at);

    -- migrations for existing DBs
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS game_players (
      id INTEGER PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      name TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_games_finished_at ON games(finished_at);
    CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
  `);

  // Migrate older DBs (best effort)
  try { db.prepare('ALTER TABLE games ADD COLUMN elo_applied INTEGER NOT NULL DEFAULT 0').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_games_elo_applied ON games(elo_applied)').run(); } catch {}
  try { db.prepare('CREATE TABLE IF NOT EXISTS ratings (player_id TEXT PRIMARY KEY, rating INTEGER NOT NULL, games_played INTEGER NOT NULL, wins INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_ratings_updated_at ON ratings(updated_at)').run(); } catch {}
  try { db.prepare('CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)').run(); } catch {}
  try { db.prepare('ALTER TABLE sessions ADD COLUMN device_id TEXT').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id)').run(); } catch {}

  return db;
}

export const sqlite = openDatabase();

function nowMs() {
  return Date.now();
}

function randToken() {
  // URL-safe enough for MVP
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function authCreateSession({ email, deviceId }) {
  const db = sqlite;
  const createdAt = nowMs();
  const token = randToken();

  // Stable playerId per device (MVP). If deviceId is missing, fall back to per-login playerId.
  const devId = deviceId ? String(deviceId).trim() : '';
  let playerId = randToken();
  if (devId) {
    const row = db.prepare('SELECT player_id AS playerId FROM devices WHERE device_id = ?').get(devId);
    if (row?.playerId) playerId = String(row.playerId);
    else db.prepare('INSERT INTO devices (device_id, player_id, created_at) VALUES (?, ?, ?)').run(devId, playerId, createdAt);
  }

  const txn = db.transaction(() => {
    let accountId = null;
    if (email) {
      const em = String(email).trim().toLowerCase();
      if (em) {
        db.prepare(`INSERT OR IGNORE INTO accounts (email, created_at) VALUES (?, ?)`).run(em, createdAt);
        const row = db.prepare(`SELECT id FROM accounts WHERE email = ?`).get(em);
        if (row?.id != null) accountId = row.id;
      }
    }

    db.prepare(`
      INSERT INTO sessions (token, account_id, device_id, player_id, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, accountId, devId || null, playerId, createdAt, createdAt);
  });

  txn();
  return { token, playerId, createdAt };
}

export function authGetSession(token) {
  if (!token) return null;
  const db = sqlite;
  const row = db.prepare(`
    SELECT s.token, s.player_id AS playerId, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt,
           a.email AS email
    FROM sessions s
    LEFT JOIN accounts a ON a.id = s.account_id
    WHERE s.token = ?
  `).get(String(token));
  if (!row) return null;
  try {
    db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token = ?`).run(nowMs(), String(token));
  } catch {}
  return row;
}


function getRating(playerId) {
  const db = sqlite;
  const row = db.prepare('SELECT player_id AS playerId, rating, games_played AS gamesPlayed, wins, updated_at AS updatedAt FROM ratings WHERE player_id = ?').get(String(playerId));
  if (row) return { ...row, rating: Number(row.rating) };
  return { playerId: String(playerId), rating: 1000, gamesPlayed: 0, wins: 0, updatedAt: null };
}

function setRating({ playerId, rating, gamesPlayed, wins }) {
  const db = sqlite;
  const now = nowMs();
  db.prepare(`
    INSERT INTO ratings (player_id, rating, games_played, wins, updated_at)
    VALUES (@player_id, @rating, @games_played, @wins, @updated_at)
    ON CONFLICT(player_id) DO UPDATE SET
      rating=excluded.rating,
      games_played=excluded.games_played,
      wins=excluded.wins,
      updated_at=excluded.updated_at
  `).run({
    player_id: String(playerId),
    rating: Math.round(Number(rating) || 1000),
    games_played: Number(gamesPlayed) || 0,
    wins: Number(wins) || 0,
    updated_at: now,
  });
}

function eloExpected(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

function applyEloForGameId(gameId) {
  const db = sqlite;
  const game = db.prepare('SELECT id, elo_applied AS eloApplied, winner_player_id AS winnerPlayerId, winner_name AS winnerName FROM games WHERE id = ?').get(gameId);
  if (!game || Number(game.eloApplied || 0) === 1) return;

  const players = db.prepare('SELECT player_id AS playerId, name, is_bot AS isBot FROM game_players WHERE game_id = ?').all(gameId);
  const humans = players.filter((p) => !p.isBot && p.playerId);
  if (humans.length < 1) {
    db.prepare('UPDATE games SET elo_applied = 1 WHERE id = ?').run(gameId);
    return;
  }

  // Determine winner.
  let winnerId = game.winnerPlayerId ? String(game.winnerPlayerId) : null;
  if (winnerId && !humans.some((p) => String(p.playerId) === winnerId)) {
    winnerId = null;
  }
  if (!winnerId && game.winnerName) {
    const byName = humans.find((p) => String(p.name || '').trim() === String(game.winnerName).trim());
    if (byName) winnerId = String(byName.playerId);
  }

  // If we still don't know winner, skip Elo (but mark applied so we don't loop).
  if (!winnerId) {
    db.prepare('UPDATE games SET elo_applied = 1 WHERE id = ?').run(gameId);
    return;
  }

  const K = 24;

  // Winner-vs-each-other pairwise (simple FFA MVP).
  const deltas = new Map();
  for (const p of humans) deltas.set(String(p.playerId), 0);

  for (const p of humans) {
    const pid = String(p.playerId);
    if (pid === winnerId) continue;

    const rw = getRating(winnerId).rating;
    const rl = getRating(pid).rating;
    const ew = eloExpected(rw, rl);
    const el = eloExpected(rl, rw);
    const dw = K * (1 - ew);
    const dl = K * (0 - el);

    deltas.set(winnerId, (deltas.get(winnerId) || 0) + dw);
    deltas.set(pid, (deltas.get(pid) || 0) + dl);
  }

  for (const p of humans) {
    const pid = String(p.playerId);
    const cur = getRating(pid);
    const isWinner = pid === winnerId;
    setRating({
      playerId: pid,
      rating: cur.rating + (deltas.get(pid) || 0),
      gamesPlayed: Number(cur.gamesPlayed || 0) + 1,
      wins: Number(cur.wins || 0) + (isWinner ? 1 : 0),
    });
  }

  db.prepare('UPDATE games SET elo_applied = 1 WHERE id = ?').run(gameId);
}

export function eloRecomputeAll() {
  const db = sqlite;
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM ratings').run();
    db.prepare('UPDATE games SET elo_applied = 0').run();
    const ids = db.prepare('SELECT id FROM games WHERE finished_at IS NOT NULL ORDER BY finished_at ASC').all();
    for (const r of ids) applyEloForGameId(r.id);
  });
  txn();
}

export function recordGameFinished({
  matchId,
  createdAt,
  finishedAt,
  durationMs,
  appVersion,
  engineVersion,
  players,
  winnerPlayerId,
  winnerName,
  resultJson,
}) {
  if (!matchId || finishedAt == null) return;

  const db = sqlite;
  const insertGame = db.prepare(`
    INSERT OR IGNORE INTO games (
      match_id, created_at, finished_at, duration_ms,
      app_version, engine_version,
      num_players, num_bots,
      winner_player_id, winner_name, result_json
    ) VALUES (
      @match_id, @created_at, @finished_at, @duration_ms,
      @app_version, @engine_version,
      @num_players, @num_bots,
      @winner_player_id, @winner_name, @result_json
    );
  `);

  const insertPlayer = db.prepare(`
    INSERT INTO game_players (game_id, player_id, name, is_bot)
    VALUES (@game_id, @player_id, @name, @is_bot);
  `);

  const txn = db.transaction(() => {
    insertGame.run({
      match_id: matchId,
      created_at: createdAt ?? finishedAt,
      finished_at: finishedAt,
      duration_ms: durationMs ?? null,
      app_version: appVersion ?? null,
      engine_version: engineVersion ?? null,
      num_players: players?.length ?? null,
      num_bots: players?.filter(p => p.isBot).length ?? 0,
      winner_player_id: winnerPlayerId ?? null,
      winner_name: winnerName ?? null,
      result_json: resultJson ?? null,
    });

    const gameRow = db.prepare('SELECT id FROM games WHERE match_id = ?').get(matchId);
    if (!gameRow) return;

    if (players && players.length > 0) {
      const deleteExisting = db.prepare('DELETE FROM game_players WHERE game_id = ?');
      deleteExisting.run(gameRow.id);

      for (const p of players) {
        insertPlayer.run({
          game_id: gameRow.id,
          player_id: p.playerId ?? null,
          name: p.name ?? null,
          is_bot: p.isBot ? 1 : 0,
        });
      }
    }
  });

  txn();

  // Log once per successful insert.
  const gameRow = db.prepare('SELECT id FROM games WHERE match_id = ?').get(matchId);
  if (gameRow) {
    try { applyEloForGameId(gameRow.id); } catch {}
    console.log(
      `Recorded game matchId=${matchId} winner=${winnerName ?? 'n/a'} finishedAt=${finishedAt}`,
    );
  }
}

export function getSummary() {
  const db = sqlite;
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS gamesTotal,
         SUM(CASE WHEN finished_at IS NOT NULL THEN 1 ELSE 0 END) AS gamesFinished,
         SUM(CASE WHEN finished_at IS NULL THEN 1 ELSE 0 END) AS gamesInProgress,
         MAX(finished_at) AS lastFinishedAt
       FROM games;`,
    )
    .get();

  return {
    gamesTotal: totals.gamesTotal ?? 0,
    gamesFinished: totals.gamesFinished ?? 0,
    gamesInProgress: totals.gamesInProgress ?? 0,
    lastFinishedAt: totals.lastFinishedAt ?? null,
  };
}

export function getLeaderboard({ limit = 20 }) {
  const db = sqlite;
  const lim = Math.min(200, Math.max(1, Number(limit) || 20));

  // Elo leaderboard (stable player_id). Join a name if we have one from recent games.
  const rows = db.prepare(`
    SELECT
      r.player_id AS playerId,
      r.rating AS rating,
      r.games_played AS games,
      r.wins AS wins,
      r.updated_at AS updatedAt,
      (
        SELECT gp.name
        FROM game_players gp
        WHERE gp.player_id = r.player_id AND gp.name IS NOT NULL AND TRIM(gp.name) <> ''
        ORDER BY gp.id DESC
        LIMIT 1
      ) AS name
    FROM ratings r
    ORDER BY r.rating DESC, r.wins DESC, r.games_played DESC
    LIMIT @limit;
  `).all({ limit: lim });

  return {
    items: rows.map((r) => ({
      playerId: r.playerId,
      name: r.name || null,
      rating: Number(r.rating || 1000),
      games: Number(r.games || 0),
      wins: Number(r.wins || 0),
      updatedAt: r.updatedAt ?? null,
    })),
  };
}

export function getGames({ limit, offset }) {
  const db = sqlite;
  const totalRow = db.prepare('SELECT COUNT(*) AS total FROM games').get();
  const items = db
    .prepare(
      `SELECT
         g.match_id AS matchId,
         g.created_at AS createdAt,
         g.finished_at AS finishedAt,
         g.duration_ms AS durationMs,
         g.winner_name AS winnerName,
         g.id AS gameId
       FROM games g
       ORDER BY g.finished_at DESC NULLS LAST, g.created_at DESC
       LIMIT @limit OFFSET @offset;`,
    )
    .all({ limit, offset });

  const playersStmt = db.prepare(
    `SELECT player_id AS playerId, name, is_bot AS isBot
     FROM game_players
     WHERE game_id = @gameId
     ORDER BY id ASC;`,
  );

  const withPlayers = items.map((row) => ({
    matchId: row.matchId,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    winnerName: row.winnerName,
    players: playersStmt.all({ gameId: row.gameId }).map((p) => ({
      playerId: p.playerId,
      name: p.name,
      isBot: !!p.isBot,
    })),
  }));

  return {
    items: withPlayers,
    total: totalRow.total ?? 0,
  };
}
