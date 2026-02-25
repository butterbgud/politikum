import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

    -- tournaments (MVP)
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      table_size INTEGER,
      status TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      config_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tournaments_created_at ON tournaments(created_at);
    CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);

    CREATE TABLE IF NOT EXISTS tournament_players (
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      name TEXT,
      joined_at INTEGER NOT NULL,
      dropped_at INTEGER,
      UNIQUE(tournament_id, player_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tournament_players_tid ON tournament_players(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tournament_players_player_id ON tournament_players(player_id);

    CREATE TABLE IF NOT EXISTS tournament_rounds (
      id INTEGER PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_index INTEGER NOT NULL,
      status TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tid ON tournament_rounds(tournament_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_rounds_tid_round ON tournament_rounds(tournament_id, round_index);


    CREATE TABLE IF NOT EXISTS tournament_tables (
      id INTEGER PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_id INTEGER REFERENCES tournament_rounds(id) ON DELETE CASCADE,
      table_index INTEGER NOT NULL,
      match_id TEXT,
      status TEXT,
      winner_player_id TEXT,
      result_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tournament_tables_tid ON tournament_tables(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tournament_tables_round_id ON tournament_tables(round_id);
    CREATE INDEX IF NOT EXISTS idx_tournament_tables_tid_round_id ON tournament_tables(tournament_id, round_id);
    CREATE INDEX IF NOT EXISTS idx_tournament_tables_match_id ON tournament_tables(match_id);
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

// Admin tool: merge historical identity ids.
// Rewrites existing recorded games and auth tables so Elo/leaderboard show a single identity.
export function adminMergePlayerIds({ fromPlayerId, intoPlayerId }) {
  const db = sqlite;
  const fromId = String(fromPlayerId || '').trim();
  const intoId = String(intoPlayerId || '').trim();
  if (!fromId || !intoId) throw new Error('fromPlayerId and intoPlayerId are required');
  if (fromId === intoId) throw new Error('fromPlayerId and intoPlayerId must differ');

  const txn = db.transaction(() => {
    const r1 = db.prepare('UPDATE game_players SET player_id = ? WHERE player_id = ?').run(intoId, fromId);
    const r2 = db.prepare('UPDATE games SET winner_player_id = ? WHERE winner_player_id = ?').run(intoId, fromId);
    const r3 = db.prepare('UPDATE sessions SET player_id = ? WHERE player_id = ?').run(intoId, fromId);
    const r4 = db.prepare('UPDATE devices SET player_id = ? WHERE player_id = ?').run(intoId, fromId);

    // Elo cache becomes invalid after any identity rewrite.
    const r5 = db.prepare('DELETE FROM ratings').run();
    const r6 = db.prepare('UPDATE games SET elo_applied = 0').run();

    return {
      ok: true,
      fromPlayerId: fromId,
      intoPlayerId: intoId,
      updated: {
        gamePlayers: r1.changes,
        gamesWinner: r2.changes,
        sessions: r3.changes,
        devices: r4.changes,
        ratingsDeleted: r5.changes,
        gamesResetEloApplied: r6.changes,
      },
    };
  });

  return txn();
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

  // If we still don't know a HUMAN winner (e.g. bots won), don't change ratings,
  // but still count the game for human participants.
  if (!winnerId) {
    for (const p of humans) {
      const pid = String(p.playerId);
      const cur = getRating(pid);
      setRating({
        playerId: pid,
        rating: cur.rating,
        gamesPlayed: Number(cur.gamesPlayed || 0) + 1,
        wins: Number(cur.wins || 0),
      });
    }
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
      num_bots: players?.filter((p) => p.isBot).length ?? 0,
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

    // If this match belongs to a tournament table, persist the result there too.
    try {
      if (!resultJson) return;
      let parsed = null;
      try {
        parsed = JSON.parse(resultJson);
      } catch {
        parsed = null;
      }
      const tMeta = parsed?.metadata?.tournament;
      const tid = tMeta?.id ? String(tMeta.id).trim() : '';
      const tableIdRaw = tMeta?.tableId;
      const tableId = Number(tableIdRaw);
      if (!tid || !Number.isFinite(tableId)) return;

      const table = db
        .prepare('SELECT id, result_json AS resultJson FROM tournament_tables WHERE tournament_id=? AND id=?')
        .get(tid, tableId);
      if (!table) return;

      let existing = {};
      if (table.resultJson) {
        try {
          existing = JSON.parse(table.resultJson) || {};
        } catch {
          existing = {};
        }
      }

      const resultPayload = {
        matchId,
        winnerPlayerId: winnerPlayerId ?? null,
        winnerName: winnerName ?? null,
        finishedAt,
        players: Array.isArray(players)
          ? players.map((p) => ({
              playerId: p.playerId ?? null,
              name: p.name ?? null,
              isBot: !!p.isBot,
            }))
          : [],
      };

      const merged = {
        ...existing,
        result: resultPayload,
      };

      db.prepare(
        'UPDATE tournament_tables SET status=@status, winner_player_id=@winner, result_json=@json WHERE id=@id',
      ).run({
        status: 'finished',
        winner: winnerPlayerId ?? null,
        json: JSON.stringify(merged),
        id: table.id,
      });
    } catch {}
  });

  txn();

  // Log once per successful insert.
  const gameRow = db.prepare('SELECT id FROM games WHERE match_id = ?').get(matchId);
  if (gameRow) {
    try {
      applyEloForGameId(gameRow.id);
    } catch {}
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


// -----------------------
// Tournaments (MVP)
// -----------------------

function tournamentId() {
  // Use crypto for lower collision risk vs Math.random.
  // Keep it short-ish for URLs/logs.
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function tournamentsList({ includeFinished } = {}) {
  const db = sqlite;
  const inc = Boolean(includeFinished);
  const where = inc ? '' : "WHERE status IN ('registering','running')";
  const sql =
    'SELECT id, name, type, table_size AS tableSize, status, created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt, config_json AS configJson\n' +
    'FROM tournaments\n' +
    (where ? (where + '\n') : '') +
    'ORDER BY created_at DESC\n' +
    'LIMIT 100;';

  const rows = db.prepare(sql).all();
  return { items: rows.map((r) => {
    let cfg = null;
    try { cfg = r.configJson ? JSON.parse(r.configJson) : null; } catch {}
    const tid = String(r.id);
    let playersCount = 0;
    try {
      const row = db.prepare('SELECT COUNT(1) AS n FROM tournament_players WHERE tournament_id=? AND dropped_at IS NULL').get(tid);
      playersCount = Number(row?.n || 0) || 0;
    } catch {}
    return { id: r.id, name: r.name, type: r.type, tableSize: Number(r.tableSize)||2, status: r.status, createdAt: r.createdAt, startedAt: r.startedAt, finishedAt: r.finishedAt, config: cfg, playersCount };
  }) };
}

export function tournamentGet({ id }) {
  const db = sqlite;
  const tid = String(id||'').trim();
  const t = db.prepare('SELECT id, name, type, table_size AS tableSize, status, created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt, config_json AS configJson FROM tournaments WHERE id=?').get(tid);
  if (!t) return null;
  let cfg=null;
  try { cfg = t.configJson ? JSON.parse(t.configJson) : null; } catch {}
  const players = db.prepare('SELECT player_id AS playerId, name, joined_at AS joinedAt, dropped_at AS droppedAt FROM tournament_players WHERE tournament_id=? AND dropped_at IS NULL ORDER BY joined_at ASC;').all(tid);
  return { id: t.id, name: t.name, type: t.type, tableSize: Number(t.tableSize)||2, status: t.status, createdAt: t.createdAt, startedAt: t.startedAt, finishedAt: t.finishedAt, config: cfg, players: players.map((p)=>({playerId:p.playerId,name:p.name,joinedAt:p.joinedAt,droppedAt:p.droppedAt})), rounds: [], tables: [] };
}

export function tournamentTablesList({ id, roundIndex } = {}) {
  const db = sqlite;
  const tid = String(id || '').trim();
  const ri = Number(roundIndex);
  const rIndex = Number.isFinite(ri) ? ri : 1;
  if (!tid || rIndex < 1) return { ok: false, error: 'bad_args' };

  const round = db.prepare('SELECT id, round_index AS roundIndex, status FROM tournament_rounds WHERE tournament_id=? AND round_index=?').get(tid, rIndex);
  if (!round) return { ok: false, error: 'round_not_found' };

  const rows = db.prepare(
    'SELECT id, table_index AS tableIndex, match_id AS matchId, status, winner_player_id AS winnerPlayerId, result_json AS resultJson\n' +
    'FROM tournament_tables\n' +
    'WHERE tournament_id=? AND round_id=?\n' +
    'ORDER BY table_index ASC;'
  ).all(tid, round.id);

  const tables = rows.map((r) => {
    let seats = [];
    let result = null;
    try {
      const res = r.resultJson ? JSON.parse(r.resultJson) : null;
      seats = Array.isArray(res?.seats) ? res.seats : [];
      if (res?.result) result = res.result;
    } catch {}
    return {
      id: r.id,
      tableIndex: Number(r.tableIndex) || 0,
      matchId: r.matchId || null,
      status: r.status || null,
      winnerPlayerId: r.winnerPlayerId || null,
      seats,
      result,
    };
  });

  return { ok: true, tournamentId: tid, round: { id: round.id, roundIndex: round.roundIndex, status: round.status }, tables };
}

export function tournamentBracketGet({ id } = {}) {
  const db = sqlite;
  const tid = String(id || '').trim();
  if (!tid) return { ok: false, error: 'bad_args' };

  const rounds = db
    .prepare(
      'SELECT id, round_index AS roundIndex, status, created_at AS createdAt\n' +
        'FROM tournament_rounds\n' +
        'WHERE tournament_id=?\n' +
        'ORDER BY round_index ASC;',
    )
    .all(tid);

  const result = rounds.map((r) => {
    const rows = db
      .prepare(
        'SELECT id, table_index AS tableIndex, match_id AS matchId, status, winner_player_id AS winnerPlayerId, result_json AS resultJson\n' +
          'FROM tournament_tables\n' +
          'WHERE tournament_id=? AND round_id=?\n' +
          'ORDER BY table_index ASC;',
      )
      .all(tid, r.id);

    const tables = rows.map((tb) => {
      let seats = [];
      let resultInfo = null;
      try {
        const res = tb.resultJson ? JSON.parse(tb.resultJson) : null;
        seats = Array.isArray(res?.seats) ? res.seats : [];
        if (res?.result) resultInfo = res.result;
      } catch {}
      return {
        id: tb.id,
        tableIndex: Number(tb.tableIndex) || 0,
        matchId: tb.matchId || null,
        status: tb.status || null,
        winnerPlayerId: tb.winnerPlayerId || null,
        seats,
        result: resultInfo,
      };
    });

    return {
      id: r.id,
      roundIndex: Number(r.roundIndex) || 0,
      status: r.status || null,
      createdAt: r.createdAt || null,
      tables,
    };
  });

  return { ok: true, tournamentId: tid, rounds: result };
}

export function tournamentTableGet({ tournamentId, tableId } = {}) {
  const db = sqlite;
  const tid = String(tournamentId || '').trim();
  const id = Number(tableId);
  if (!tid || !Number.isFinite(id)) return null;

  const row = db.prepare(
    'SELECT id, tournament_id AS tournamentId, table_index AS tableIndex, match_id AS matchId, status, result_json AS resultJson\n' +
    'FROM tournament_tables\n' +
    'WHERE tournament_id=? AND id=?'
  ).get(tid, id);

  if (!row) return null;

  let seats = [];
  try {
    const res = row.resultJson ? JSON.parse(row.resultJson) : null;
    seats = Array.isArray(res?.seats) ? res.seats : [];
  } catch {}

  return {
    id: row.id,
    tournamentId: row.tournamentId,
    tableIndex: Number(row.tableIndex) || 0,
    matchId: row.matchId || null,
    status: row.status || null,
    seats,
  };
}

export function tournamentTableSetMatch({ tournamentId, tableId, matchId, status } = {}) {
  const db = sqlite;
  const tid = String(tournamentId || '').trim();
  const id = Number(tableId);
  const mid = matchId == null ? null : String(matchId);
  const st = status == null ? null : String(status);
  if (!tid || !Number.isFinite(id) || !mid) return { ok: false, error: 'bad_args' };

  const res = db.prepare(
    'UPDATE tournament_tables SET match_id=@m, status=@s WHERE tournament_id=@t AND id=@id'
  ).run({ t: tid, id, m: mid, s: st });

  if (!res.changes) return { ok: false, error: 'not_found' };
  return { ok: true };
}

export function tournamentTableSetResult({ tournamentId, tableId, winnerPlayerId, result } = {}) {
  const db = sqlite;
  const tid = String(tournamentId || '').trim();
  const id = Number(tableId);
  const winner = winnerPlayerId == null ? null : String(winnerPlayerId || '').trim() || null;
  let resultJson = null;
  try { resultJson = result == null ? null : JSON.stringify(result); } catch { resultJson = null; }
  if (!tid || !Number.isFinite(id)) return { ok: false, error: 'bad_args' };

  const res = db.prepare(
    'UPDATE tournament_tables SET status=@s, winner_player_id=@w, result_json=COALESCE(@r, result_json) WHERE tournament_id=@t AND id=@id'
  ).run({ t: tid, id, s: 'finished', w: winner, r: resultJson, id });

  if (!res.changes) return { ok: false, error: 'not_found' };
  return { ok: true };
}

export function tournamentCreate(body = {}) {
  const db = sqlite;
  const id = tournamentId();
  const createdAt = nowMs();
  const cfg = { name: String(body.name||'').trim()||'Tournament', type: String(body.type||'single_elim'), tableSize: Number(body.tableSize)||2, maxPlayers: body.maxPlayers==null?null:(Number(body.maxPlayers)||null), seeding: String(body.seeding||'random'), allowSpectators: Boolean(body.allowSpectators) };
  db.prepare('INSERT INTO tournaments (id,name,type,table_size,status,created_at,started_at,finished_at,config_json) VALUES (@id,@name,@type,@table_size,@status,@created_at,NULL,NULL,@config_json)').run({ id, name: cfg.name, type: cfg.type, table_size: cfg.tableSize, status: 'registering', created_at: createdAt, config_json: JSON.stringify(cfg) });
  return { ok: true, tournament: tournamentGet({ id }) };
}

export function tournamentSetStatus({ id, status }) {
  const db = sqlite;
  const tid = String(id||'').trim();
  const row = db.prepare('SELECT id FROM tournaments WHERE id=?').get(tid);
  if (!row) return { ok:false, error:'not_found' };
  const next = String(status||'').trim();
  if (!['registering','running','finished','canceled'].includes(next)) return { ok:false, error:'bad_status' };
  const now = nowMs();
  const started = next==='running' ? now : null;
  const finished = (next==='finished'||next==='canceled') ? now : null;
  db.prepare('UPDATE tournaments SET status=@status, started_at=COALESCE(started_at,@started), finished_at=CASE WHEN @finished IS NULL THEN finished_at ELSE @finished END WHERE id=@id').run({ id: tid, status: next, started, finished });
  return { ok:true, tournament: tournamentGet({ id: tid }) };
}

export function tournamentJoin({ id, playerId, name }) {
  const db = sqlite;
  const tid=String(id||'').trim();
  const pid=String(playerId||'').trim();
  if (!tid||!pid) return { ok:false, error:'bad_args' };
  const t = db.prepare('SELECT status FROM tournaments WHERE id=?').get(tid);
  if (!t) return { ok:false, error:'not_found' };
  if (String(t.status)!=='registering') return { ok:false, error:'not_registering' };
  db.prepare('INSERT INTO tournament_players (tournament_id,player_id,name,joined_at,dropped_at) VALUES (@t,@p,@n,@j,NULL) ON CONFLICT(tournament_id,player_id) DO UPDATE SET dropped_at=NULL, name=COALESCE(excluded.name,tournament_players.name)').run({ t: tid, p: pid, n: String(name||'').trim()||null, j: nowMs() });
  return { ok:true, tournament: tournamentGet({ id: tid }) };
}

export function tournamentLeave({ id, playerId }) {
  const db = sqlite;
  const tid=String(id||'').trim();
  const pid=String(playerId||'').trim();
  if (!tid||!pid) return { ok:false, error:'bad_args' };
  const t = db.prepare('SELECT status FROM tournaments WHERE id=?').get(tid);
  if (!t) return { ok:false, error:'not_found' };
  if (String(t.status)!=='registering') return { ok:false, error:'not_registering' };
  db.prepare('UPDATE tournament_players SET dropped_at=@d WHERE tournament_id=@t AND player_id=@p').run({ t: tid, p: pid, d: nowMs() });
  return { ok:true, tournament: tournamentGet({ id: tid }) };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function tournamentGenerateRound1({ id }) {
  const db = sqlite;
  const tid = String(id||'').trim();
  if (!tid) return { ok:false, error:'bad_args' };

  const t = db.prepare('SELECT id, table_size AS tableSize, status FROM tournaments WHERE id=?').get(tid);
  if (!t) return { ok:false, error:'not_found' };
  if (String(t.status) !== 'registering') return { ok:false, error:'not_registering' };

  // prevent duplicates
  const existing = db.prepare('SELECT id FROM tournament_rounds WHERE tournament_id=? AND round_index=1').get(tid);
  if (existing) return { ok:false, error:'round_exists' };

  const tableSize = Math.max(2, Number(t.tableSize) || 2);

  const players = db.prepare('SELECT player_id AS playerId, name FROM tournament_players WHERE tournament_id=? AND dropped_at IS NULL ORDER BY joined_at ASC').all(tid);
  const ids = players.map((p) => ({ playerId: String(p.playerId), name: p.name || null }));
  if (ids.length < 2) return { ok:false, error:'not_enough_players' };

  shuffleInPlace(ids);

  const now = nowMs();
  const round = db.prepare('INSERT INTO tournament_rounds (tournament_id, round_index, status, created_at) VALUES (@t,@r,@s,@c) RETURNING id').get({ t: tid, r: 1, s: 'pending', c: now });
  const roundId = round?.id;

  const tables = [];
  let tableIndex = 1;
  for (let i = 0; i < ids.length; i += tableSize) {
    const slice = ids.slice(i, i + tableSize);
    // allow last table smaller (MVP)
    const row = db.prepare('INSERT INTO tournament_tables (tournament_id, round_id, table_index, match_id, status, winner_player_id, result_json) VALUES (@t,@rid,@ti,NULL,@s,NULL,@rj) RETURNING id').get({
      t: tid,
      rid: roundId,
      ti: tableIndex,
      s: 'pending',
      rj: JSON.stringify({ seats: slice.map((p, idx) => ({ seat: idx, playerId: p.playerId, name: p.name })) }),
    });
    tables.push({ id: row?.id, tableIndex, seats: slice });
    tableIndex++;
  }

  return { ok:true, round: { id: roundId, roundIndex: 1 }, tables, tournament: tournamentGet({ id: tid }) };
}
