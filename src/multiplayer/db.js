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

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
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

export function authCreateSession({ email }) {
  const db = sqlite;
  const createdAt = nowMs();
  const token = randToken();
  const playerId = randToken(); // not pretty but stable; can swap to uuid later.

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
      INSERT INTO sessions (token, account_id, player_id, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, accountId, playerId, createdAt, createdAt);
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

  // MVP identity = player name string (no accounts yet).
  const rows = db.prepare(`
    WITH humans AS (
      SELECT gp.name AS name
      FROM game_players gp
      WHERE gp.is_bot = 0 AND gp.name IS NOT NULL AND TRIM(gp.name) <> ''
    )
    SELECT
      h.name AS name,
      COUNT(*) AS games,
      SUM(CASE WHEN g.winner_name = h.name THEN 1 ELSE 0 END) AS wins,
      MAX(g.finished_at) AS lastFinishedAt
    FROM humans h
    JOIN game_players gp ON gp.name = h.name AND gp.is_bot = 0
    JOIN games g ON g.id = gp.game_id
    WHERE g.finished_at IS NOT NULL
    GROUP BY h.name
    ORDER BY wins DESC, games DESC, lastFinishedAt DESC
    LIMIT @limit;
  `).all({ limit: lim });

  return {
    items: rows.map((r) => ({
      name: r.name,
      games: Number(r.games || 0),
      wins: Number(r.wins || 0),
      lastFinishedAt: r.lastFinishedAt ?? null,
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
