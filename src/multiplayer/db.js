import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Glicko2 } = require('glicko2');

const GLICKO2_DEFAULT_RATING = 1500;
const GLICKO2_DEFAULT_RD = 350;
const GLICKO2_DEFAULT_VOL = 0.06;
const GLICKO2_TAU = 0.5;

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
      username TEXT,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions(account_id);

    -- Username+token auth (MVP prod)
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      player_id TEXT UNIQUE NOT NULL,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_player_id ON users(player_id);

    -- Public player profiles (works for legacy sessions too)
    CREATE TABLE IF NOT EXISTS player_profiles (
      player_id TEXT PRIMARY KEY,
      bio_text TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_player_profiles_updated_at ON player_profiles(updated_at);

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
      rd REAL NOT NULL,
      vol REAL NOT NULL,
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
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_game_players_game_player ON game_players(game_id, player_id);

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

    -- global pre-lobby chat (MVP)
    CREATE TABLE IF NOT EXISTS lobby_chat_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS lobby_chat_messages (
      id INTEGER PRIMARY KEY,
      created_at INTEGER NOT NULL,
      player_id TEXT,
      name TEXT,
      text TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_lobby_chat_messages_created_at ON lobby_chat_messages(created_at);

    -- bug reports (MVP)
    CREATE TABLE IF NOT EXISTS bugreports (
      id INTEGER PRIMARY KEY,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      match_id TEXT,
      player_id TEXT,
      name TEXT,
      contact TEXT,
      text TEXT NOT NULL,
      context_json TEXT,
      user_agent TEXT,
      url TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_bugreports_created_at ON bugreports(created_at);
    CREATE INDEX IF NOT EXISTS idx_bugreports_status ON bugreports(status);
    CREATE INDEX IF NOT EXISTS idx_bugreports_match_id ON bugreports(match_id);
  `);

  // Migrate older DBs (best effort, but avoid throwing during startup)
  const hasColumn = (table, col) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${table})`).all();
      return rows.some((r) => String(r?.name || '') === String(col));
    } catch {
      return false;
    }
  };

  try { db.prepare('CREATE TABLE IF NOT EXISTS ratings (player_id TEXT PRIMARY KEY, rating INTEGER NOT NULL, rd REAL NOT NULL, vol REAL NOT NULL, games_played INTEGER NOT NULL, wins INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_ratings_updated_at ON ratings(updated_at)').run(); } catch {}

  // ratings.rd + ratings.vol (Glicko-2)
  try {
    if (!hasColumn('ratings', 'rd')) {
      db.prepare('ALTER TABLE ratings ADD COLUMN rd REAL NOT NULL DEFAULT 350').run();
    }
  } catch {}
  try {
    if (!hasColumn('ratings', 'vol')) {
      db.prepare('ALTER TABLE ratings ADD COLUMN vol REAL NOT NULL DEFAULT 0.06').run();
    }
  } catch {}

  // games.elo_applied
  try {
    if (!hasColumn('games', 'elo_applied')) {
      db.prepare('ALTER TABLE games ADD COLUMN elo_applied INTEGER NOT NULL DEFAULT 0').run();
    }
  } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_games_elo_applied ON games(elo_applied)').run(); } catch {}

  // sessions.device_id
  try {
    if (!hasColumn('sessions', 'device_id')) {
      db.prepare('ALTER TABLE sessions ADD COLUMN device_id TEXT').run();
    }
  } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id)').run(); } catch {}

  // sessions.username
  try {
    if (!hasColumn('sessions', 'username')) {
      db.prepare('ALTER TABLE sessions ADD COLUMN username TEXT').run();
    }
  } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)').run(); } catch {}

  // player_profiles (new)
  try {
    db.prepare('CREATE TABLE IF NOT EXISTS player_profiles (player_id TEXT PRIMARY KEY, bio_text TEXT, updated_at INTEGER NOT NULL)').run();
  } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_player_profiles_updated_at ON player_profiles(updated_at)').run(); } catch {}

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

function hashUserToken(token) {
  const t = String(token || '');
  const salt = crypto.randomBytes(16);
  const iters = 120_000;
  const hash = crypto.pbkdf2Sync(Buffer.from(t, 'utf8'), salt, iters, 32, 'sha256');
  return `pbkdf2_sha256$${iters}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyUserToken(token, stored) {
  try {
    const [kind, itStr, saltHex, hashHex] = String(stored || '').split('$');
    if (kind !== 'pbkdf2_sha256') return false;
    const iters = Math.max(1, Number(itStr) || 0);
    if (!iters || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const got = crypto.pbkdf2Sync(Buffer.from(String(token || ''), 'utf8'), salt, iters, expected.length, 'sha256');
    return crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
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


export function authCreateSessionForPlayer({ playerId, username, deviceId }) {
  const db = sqlite;
  const createdAt = nowMs();
  const token = randToken();

  const pid = String(playerId || '').trim();
  if (!pid) throw new Error('playerId required');

  const uname = username == null ? null : String(username || '').trim().toLowerCase();
  const devId = deviceId ? String(deviceId).trim() : '';

  db.prepare(`
    INSERT INTO sessions (token, account_id, device_id, player_id, username, created_at, last_seen_at)
    VALUES (?, NULL, ?, ?, ?, ?, ?)
  `).run(token, devId || null, pid, uname || null, createdAt, createdAt);

  return { token, playerId: pid, username: uname || null, createdAt };
}

export function authGetSession(token) {
  if (!token) return null;
  const db = sqlite;
  const row = db.prepare(`
    SELECT s.token, s.player_id AS playerId, s.username AS username, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt,
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


export function authRegisterOrLogin({ username, token, deviceId }) {
  const db = sqlite;
  const unameRaw = String(username || '').trim();
  const uname = unameRaw.toLowerCase();
  const tok = String(token || '');

  if (!uname || uname.length < 2) throw new Error('username_too_short');
  if (!/^[a-z0-9_\-\.]{2,32}$/.test(uname)) throw new Error('username_invalid');
  if (tok.length < 4) throw new Error('token_too_short');

  const createdAt = nowMs();

  const row = db
    .prepare('SELECT username, player_id AS playerId, token_hash AS tokenHash FROM users WHERE username = ?')
    .get(uname);

  const canonicalPlayerId = uname;

  if (!row) {
    const playerId = canonicalPlayerId;
    const tokenHash = hashUserToken(tok);
    db.prepare('INSERT INTO users (username, player_id, token_hash, created_at) VALUES (?, ?, ?, ?)').run(
      uname,
      playerId,
      tokenHash,
      createdAt,
    );
    return authCreateSessionForPlayer({ playerId, username: uname, deviceId });
  }

  if (!verifyUserToken(tok, row.tokenHash)) {
    const err = new Error('invalid_token');
    err.status = 401;
    throw err;
  }

  // Canonicalize player_id to username for short profile URLs.
  // If user was created earlier with a random player_id, migrate once by merging history.
  if (String(row.playerId || '') !== String(canonicalPlayerId)) {
    try {
      adminMergePlayerIds({ fromPlayerId: row.playerId, intoPlayerId: canonicalPlayerId });
      db.prepare('UPDATE users SET player_id = ? WHERE username = ?').run(canonicalPlayerId, uname);
      row.playerId = canonicalPlayerId;
    } catch (e) {
      // If merge fails (e.g. conflicting existing ids), still allow login with current id.
    }
  }

  return authCreateSessionForPlayer({ playerId: row.playerId, username: uname, deviceId });
}

export function authChangeToken({ sessionToken, oldToken, newToken }) {
  const db = sqlite;
  const sess = authGetSession(String(sessionToken || ''));
  if (!sess) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }

  const uname = String(sess.username || '').trim().toLowerCase();
  if (!uname) throw new Error('no_username');

  const oldT = String(oldToken || '');
  const newT = String(newToken || '');
  if (newT.length < 4) throw new Error('token_too_short');

  const row = db.prepare('SELECT token_hash AS tokenHash FROM users WHERE username = ?').get(uname);
  if (!row) throw new Error('user_not_found');

  if (!verifyUserToken(oldT, row.tokenHash)) {
    const err = new Error('invalid_token');
    err.status = 401;
    throw err;
  }

  const tokenHash = hashUserToken(newT);
  db.prepare('UPDATE users SET token_hash = ? WHERE username = ?').run(tokenHash, uname);
  return { ok: true };
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
  const row = db.prepare('SELECT player_id AS playerId, rating, rd, vol, games_played AS gamesPlayed, wins, updated_at AS updatedAt FROM ratings WHERE player_id = ?').get(String(playerId));
  if (row) {
    return {
      ...row,
      rating: Number(row.rating),
      rd: Number(row.rd),
      vol: Number(row.vol),
    };
  }
  return {
    playerId: String(playerId),
    rating: GLICKO2_DEFAULT_RATING,
    rd: GLICKO2_DEFAULT_RD,
    vol: GLICKO2_DEFAULT_VOL,
    gamesPlayed: 0,
    wins: 0,
    updatedAt: null,
  };
}

function setRating({ playerId, rating, rd, vol, gamesPlayed, wins }) {
  const db = sqlite;
  const now = nowMs();
  db.prepare(`
    INSERT INTO ratings (player_id, rating, rd, vol, games_played, wins, updated_at)
    VALUES (@player_id, @rating, @rd, @vol, @games_played, @wins, @updated_at)
    ON CONFLICT(player_id) DO UPDATE SET
      rating=excluded.rating,
      rd=excluded.rd,
      vol=excluded.vol,
      games_played=excluded.games_played,
      wins=excluded.wins,
      updated_at=excluded.updated_at
  `).run({
    player_id: String(playerId),
    rating: Math.round(Number(rating) || GLICKO2_DEFAULT_RATING),
    rd: Number.isFinite(Number(rd)) ? Number(rd) : GLICKO2_DEFAULT_RD,
    vol: Number.isFinite(Number(vol)) ? Number(vol) : GLICKO2_DEFAULT_VOL,
    games_played: Number(gamesPlayed) || 0,
    wins: Number(wins) || 0,
    updated_at: now,
  });
}

function applyGlicko2ForGameId(gameId) {
  const db = sqlite;
  // NOTE: column is still named elo_applied for migration simplicity; now it means “rating applied”.
  const game = db.prepare('SELECT id, elo_applied AS ratingApplied, winner_player_id AS winnerPlayerId, winner_name AS winnerName FROM games WHERE id = ?').get(gameId);
  if (!game || Number(game.ratingApplied || 0) === 1) return;

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

  // Glicko-2 engine
  const ranking = new Glicko2({
    tau: GLICKO2_TAU,
    rating: GLICKO2_DEFAULT_RATING,
    rd: GLICKO2_DEFAULT_RD,
    vol: GLICKO2_DEFAULT_VOL,
  });

  const objs = new Map();
  for (const p of humans) {
    const pid = String(p.playerId);
    const cur = getRating(pid);
    const pl = ranking.makePlayer(Number(cur.rating), Number(cur.rd), Number(cur.vol));
    objs.set(pid, { cur, pl });
  }

  const matches = [];

  if (winnerId) {
    // Winner-vs-each-other pairwise (simple FFA MVP)
    for (const p of humans) {
      const pid = String(p.playerId);
      if (pid === winnerId) continue;
      matches.push([objs.get(winnerId).pl, objs.get(pid).pl, 1]);
    }
  } else {
    // No known winner: treat as draw (only meaningful for 2 humans)
    if (humans.length === 2) {
      const a = String(humans[0].playerId);
      const b = String(humans[1].playerId);
      matches.push([objs.get(a).pl, objs.get(b).pl, 0.5]);
    }
  }

  if (matches.length) {
    ranking.updateRatings(matches);
  }

  // Persist updated ratings; if no matches (e.g. 1 human), just count the game.
  for (const p of humans) {
    const pid = String(p.playerId);
    const o = objs.get(pid);
    const isWinner = winnerId && pid === winnerId;

    const newRating = matches.length ? o.pl.getRating() : o.cur.rating;
    const newRd = matches.length ? o.pl.getRd() : o.cur.rd;
    const newVol = matches.length ? o.pl.getVol() : o.cur.vol;

    setRating({
      playerId: pid,
      rating: newRating,
      rd: newRd,
      vol: newVol,
      gamesPlayed: Number(o.cur.gamesPlayed || 0) + 1,
      wins: Number(o.cur.wins || 0) + (isWinner ? 1 : 0),
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
    for (const r of ids) applyGlicko2ForGameId(r.id);
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
    INSERT OR IGNORE INTO game_players (game_id, player_id, name, is_bot)
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
      applyGlicko2ForGameId(gameRow.id);
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

export function getLeaderboard({ limit = 20, registeredOnly = false } = {}) {
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
        SELECT u.username
        FROM users u
        WHERE u.player_id = r.player_id
        LIMIT 1
      ) AS username,
      (
        SELECT gp.name
        FROM game_players gp
        WHERE gp.player_id = r.player_id AND gp.name IS NOT NULL AND TRIM(gp.name) <> ''
        ORDER BY gp.id DESC
        LIMIT 1
      ) AS name,
      (
        SELECT MAX(g.finished_at)
        FROM games g
        WHERE g.winner_player_id = r.player_id
      ) AS lastFinishedAt
    FROM ratings r
    WHERE (@registeredOnly = 0)
       OR EXISTS (SELECT 1 FROM users u WHERE u.player_id = r.player_id)
    ORDER BY r.rating DESC, r.wins DESC, r.games_played DESC
    LIMIT @limit;
  `).all({ limit: lim, registeredOnly: registeredOnly ? 1 : 0 });

  return {
    items: rows.map((r) => ({
      playerId: r.playerId,
      name: (r.username || r.name) || null,
      rating: Number(r.rating || 1000),
      games: Number(r.games || 0),
      wins: Number(r.wins || 0),
      updatedAt: r.updatedAt ?? null,
      lastFinishedAt: r.lastFinishedAt ?? null,
    })),
  };
}

export function getPublicProfile({ playerId }) {
  const pid = String(playerId || '').trim();
  if (!pid) return { ok:false, error:'bad_args' };
  const db = sqlite;

  const ratingRow = db.prepare('SELECT rating FROM ratings WHERE player_id=?').get(pid);
  const rating = ratingRow ? Number(ratingRow.rating || 1000) : 1000;

  // authoritative counts from finished games table
  // NOTE: we must count wins only for games where this player participated (join via game_players).
  const counts = db.prepare(`
    SELECT
      COUNT(DISTINCT g.id) AS games,
      COUNT(DISTINCT CASE WHEN g.winner_player_id = @pid THEN g.id END) AS wins
    FROM games g
    JOIN game_players gp ON gp.game_id = g.id
    WHERE gp.player_id = @pid AND g.finished_at IS NOT NULL;
  `).get({ pid });

  const games = Number(counts?.games || 0);
  const wins = Number(counts?.wins || 0);

  const nameRow = db.prepare(`
    SELECT gp.name AS name
    FROM game_players gp
    WHERE gp.player_id = ? AND gp.name IS NOT NULL AND TRIM(gp.name) <> ''
    ORDER BY gp.id DESC
    LIMIT 1;
  `).get(pid);

  const userRow = db.prepare('SELECT username FROM users WHERE player_id = ?').get(pid);
  const profRow = db.prepare('SELECT bio_text AS bioText FROM player_profiles WHERE player_id = ?').get(pid);

  const username = userRow?.username || null;
  const displayName = username || (nameRow?.name || null);

  return {
    ok: true,
    playerId: pid,
    username,
    name: displayName,
    rating,
    games,
    wins,
    winRate: games ? (wins / games) : 0,
    bioText: profRow?.bioText || null,
  };
}

export function setUserBio({ playerId, bioText }) {
  const pid = String(playerId || '').trim();
  if (!pid) return { ok:false, error:'bad_args' };
  const bio = String(bioText || '');
  const clean = bio.replace(/\r/g, '').trim().slice(0, 800);
  const db = sqlite;
  const now = nowMs();
  db.prepare(`
    INSERT INTO player_profiles (player_id, bio_text, updated_at)
    VALUES (@pid, @bio, @now)
    ON CONFLICT(player_id) DO UPDATE SET
      bio_text=excluded.bio_text,
      updated_at=excluded.updated_at
  `).run({ pid, bio: clean || null, now });
  return { ok:true, bioText: clean || '' };
}

export function getGameByMatchId(matchId) {
  const mid = String(matchId || '').trim();
  if (!mid) return null;
  const db = sqlite;
  const g = db.prepare('SELECT * FROM games WHERE match_id = ?').get(mid);
  if (!g) return null;
  const players = db.prepare('SELECT player_id AS playerId, name, is_bot AS isBot FROM game_players WHERE game_id = ?').all(g.id);
  return {
    matchId: g.match_id,
    createdAt: g.created_at,
    finishedAt: g.finished_at,
    durationMs: g.duration_ms,
    winnerPlayerId: g.winner_player_id,
    winnerName: g.winner_name,
    appVersion: g.app_version,
    engineVersion: g.engine_version,
    resultJson: g.result_json,
    players: (players || []).map((p) => ({ ...p, isBot: !!p.isBot })),
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
    'UPDATE tournament_tables SET status=@s, winner_player_id=@w, result_json=@r WHERE tournament_id=@t AND id=@id'
  ).run({ t: tid, id, s: 'finished', w: winner, r: resultJson, id });

  if (!res.changes) return { ok: false, error: 'not_found' };

  // Auto-finish 2-player single_elim tournaments: Round 1 is the final.
  try {
    const t = db.prepare('SELECT type, table_size AS tableSize, status, config_json AS cfg FROM tournaments WHERE id=?').get(tid);
    if (t && String(t.status) !== 'finished') {
      const type = String(t.type || '');
      const tableSize = Math.max(2, Number(t.tableSize) || 2);
      const activePlayers = Number(db.prepare('SELECT COUNT(1) AS n FROM tournament_players WHERE tournament_id=? AND dropped_at IS NULL').get(tid)?.n || 0) || 0;
      const finishedTables = Number(db.prepare("SELECT COUNT(1) AS n FROM tournament_tables tt JOIN tournament_rounds tr ON tr.id=tt.round_id WHERE tr.tournament_id=? AND tr.round_index=1 AND tt.status='finished'").get(tid)?.n || 0) || 0;
      if (type === 'single_elim' && tableSize === 2 && activePlayers === 2 && finishedTables >= 1) {
        const winnerName = winner ? (db.prepare('SELECT name FROM tournament_players WHERE tournament_id=? AND player_id=?').get(tid, winner)?.name || null) : null;
        db.prepare('UPDATE tournaments SET status=@s, finished_at=@f WHERE id=@id').run({ id: tid, s: 'finished', f: nowMs() });
        // Store winner summary in config_json (lightweight MVP)
        try {
          const cfg = t.cfg ? JSON.parse(String(t.cfg)) : {};
          cfg.winner = { playerId: winner || null, name: winnerName };
          db.prepare('UPDATE tournaments SET config_json=@c WHERE id=@id').run({ id: tid, c: JSON.stringify(cfg) });
        } catch {}
      }

      // Auto-finish double_elim tournaments: when only one player remains (losses < 2).
      if (type === 'double_elim') {
        try {
          const players = db.prepare('SELECT player_id AS playerId, name FROM tournament_players WHERE tournament_id=? AND dropped_at IS NULL').all(tid);
          const losses = new Map();
          for (const p of players) losses.set(String(p.playerId), 0);

          const rows = db.prepare(
            "SELECT tt.winner_player_id AS winnerPlayerId, tt.result_json AS resultJson " +
            "FROM tournament_tables tt " +
            "JOIN tournament_rounds tr ON tr.id = tt.round_id " +
            "WHERE tr.tournament_id = ? AND tt.status = 'finished' " +
            "ORDER BY tr.round_index ASC, tt.table_index ASC;"
          ).all(tid);

          for (const row of rows) {
            const wpid = row.winnerPlayerId ? String(row.winnerPlayerId) : null;
            let seats = [];
            try {
              const parsed = row.resultJson ? JSON.parse(row.resultJson) : null;
              if (Array.isArray(parsed?.seats)) seats = parsed.seats;
            } catch {}
            for (const s of seats) {
              const pid = s?.playerId ? String(s.playerId) : null;
              if (!pid || !losses.has(pid)) continue;
              if (wpid && pid === wpid) continue;
              const next = (losses.get(pid) || 0) + 1;
              losses.set(pid, next);
            }
          }

          const survivors = [];
          for (const p of players) {
            const pid = String(p.playerId);
            const l = losses.get(pid) || 0;
            if (l < 2) survivors.push({ playerId: pid, name: p.name || null, losses: l });
          }

          if (survivors.length === 1) {
            const champ = survivors[0];
            const winnerName = champ.name || (db.prepare('SELECT name FROM tournament_players WHERE tournament_id=? AND player_id=?').get(tid, champ.playerId)?.name || null);
            db.prepare('UPDATE tournaments SET status=@s, finished_at=@f WHERE id=@id').run({ id: tid, s: 'finished', f: nowMs() });
            try {
              const cfg = t.cfg ? JSON.parse(String(t.cfg)) : {};
              cfg.winner = { playerId: champ.playerId, name: winnerName, losses: champ.losses };
              db.prepare('UPDATE tournaments SET config_json=@c WHERE id=@id').run({ id: tid, c: JSON.stringify(cfg) });
            } catch {}
          }
        } catch {}
      }
    }
  } catch {}

  return { ok: true };
}

export function tournamentCreate(body = {}) {
  const db = sqlite;
  const id = tournamentId();
  const createdAt = nowMs();
  let tableSize = Number(body.tableSize) || 2;
  if (!Number.isFinite(tableSize) || tableSize < 2) tableSize = 2;
  if (tableSize > 5) tableSize = 5;
  const type = String(body.type || 'single_elim');
  const cfg = { name: String(body.name||'').trim()||'Tournament', type, tableSize, maxPlayers: body.maxPlayers==null?null:(Number(body.maxPlayers)||null), seeding: String(body.seeding||'random'), allowSpectators: Boolean(body.allowSpectators) };
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

  const tableSize = Math.max(2, Math.min(5, Number(t.tableSize) || 2));

  const players = db.prepare('SELECT player_id AS playerId, name FROM tournament_players WHERE tournament_id=? AND dropped_at IS NULL ORDER BY joined_at ASC').all(tid);
  const ids = players.map((p) => ({ playerId: String(p.playerId), name: p.name || null }));
  if (ids.length < 2) return { ok:false, error:'not_enough_players' };

  shuffleInPlace(ids);

  const now = nowMs();
  const round = db.prepare('INSERT INTO tournament_rounds (tournament_id, round_index, status, created_at) VALUES (@t,@r,@s,@c) RETURNING id').get({ t: tid, r: 1, s: 'pending', c: now });
  const roundId = round?.id;

  const tables = [];
  let tableIndex = 1;
  for (let i = 0; i < ids.length;) {
    const remaining = ids.length - i;
    if (remaining === 1) break; // single bye
    const size = Math.min(tableSize, remaining);
    const slice = ids.slice(i, i + size);
    const row = db.prepare('INSERT INTO tournament_tables (tournament_id, round_id, table_index, match_id, status, winner_player_id, result_json) VALUES (@t,@rid,@ti,NULL,@s,NULL,@rj) RETURNING id').get({
      t: tid,
      rid: roundId,
      ti: tableIndex,
      s: 'pending',
      rj: JSON.stringify({ seats: slice.map((p, idx) => ({ seat: idx, playerId: p.playerId, name: p.name })) }),
    });
    tables.push({ id: row?.id, tableIndex, seats: slice });
    tableIndex++;
    i += size;
  }

  return { ok:true, round: { id: roundId, roundIndex: 1 }, tables, tournament: tournamentGet({ id: tid }) };
}

// Double elimination support: generate subsequent rounds by grouping players by current loss count.
export function tournamentGenerateNextRound({ id }) {
  const db = sqlite;
  const tid = String(id || '').trim();
  if (!tid) return { ok: false, error: 'bad_args' };

  const t = db.prepare('SELECT id, type, table_size AS tableSize, status FROM tournaments WHERE id=?').get(tid);
  if (!t) return { ok: false, error: 'not_found' };
  if (String(t.type || '') !== 'double_elim') return { ok: false, error: 'bad_type' };
  if (String(t.status || '') !== 'running') return { ok: false, error: 'not_running' };

  const tableSize = Math.max(2, Math.min(5, Number(t.tableSize) || 2));

  const lastRoundRow = db.prepare('SELECT MAX(round_index) AS maxRound FROM tournament_rounds WHERE tournament_id=?').get(tid);
  const lastRoundIndex = Number(lastRoundRow?.maxRound || 0) || 0;
  if (!lastRoundIndex) return { ok: false, error: 'no_rounds' };

  const lastRound = db.prepare('SELECT id FROM tournament_rounds WHERE tournament_id=? AND round_index=?').get(tid, lastRoundIndex);
  if (!lastRound?.id) return { ok: false, error: 'round_not_found' };

  const unfinished = Number(db.prepare("SELECT COUNT(1) AS n FROM tournament_tables WHERE tournament_id=? AND round_id=? AND status<>'finished'").get(tid, lastRound.id)?.n || 0) || 0;
  if (unfinished > 0) return { ok: false, error: 'round_not_finished' };

  const players = db.prepare('SELECT player_id AS playerId, name FROM tournament_players WHERE tournament_id=? AND dropped_at IS NULL ORDER BY joined_at ASC').all(tid);
  if (players.length < 2) return { ok: false, error: 'not_enough_players' };

  const nameById = new Map();
  const losses = new Map();
  for (const p of players) {
    const pid = String(p.playerId);
    nameById.set(pid, p.name || null);
    losses.set(pid, 0);
  }

  const rows = db.prepare(
    "SELECT tt.winner_player_id AS winnerPlayerId, tt.result_json AS resultJson " +
    "FROM tournament_tables tt " +
    "JOIN tournament_rounds tr ON tr.id = tt.round_id " +
    "WHERE tr.tournament_id = ? AND tt.status = 'finished' " +
    "ORDER BY tr.round_index ASC, tt.table_index ASC;"
  ).all(tid);

  for (const row of rows) {
    const wpid = row.winnerPlayerId ? String(row.winnerPlayerId) : null;
    let seats = [];
    try {
      const parsed = row.resultJson ? JSON.parse(row.resultJson) : null;
      if (Array.isArray(parsed?.seats)) seats = parsed.seats;
    } catch {}
    for (const s of seats) {
      const pid = s?.playerId ? String(s.playerId) : null;
      if (!pid || !losses.has(pid)) continue;
      if (wpid && pid === wpid) continue;
      const next = (losses.get(pid) || 0) + 1;
      losses.set(pid, next);
    }
  }

  const survivors0 = [];
  const survivors1 = [];
  for (const p of players) {
    const pid = String(p.playerId);
    const l = losses.get(pid) || 0;
    if (l >= 2) continue;
    if (l === 0) survivors0.push(pid);
    else if (l === 1) survivors1.push(pid);
  }

  const totalSurvivors = survivors0.length + survivors1.length;
  if (totalSurvivors <= 1) return { ok: false, error: 'tournament_finished' };

  // Grand final: one player with 0 losses vs one with 1 loss.
  if (survivors0.length === 1 && survivors1.length === 1) {
    const nextRoundIndex = lastRoundIndex + 1;
    const now = nowMs();
    const round = db.prepare('INSERT INTO tournament_rounds (tournament_id, round_index, status, created_at) VALUES (@t,@r,@s,@c) RETURNING id').get({ t: tid, r: nextRoundIndex, s: 'pending', c: now });
    const roundId = round?.id;
    const tables = [];
    const pair = [survivors0[0], survivors1[0]];
    const seats = pair.map((pid, idx) => ({ seat: idx, playerId: pid, name: nameById.get(pid) || null }));
    const row = db.prepare('INSERT INTO tournament_tables (tournament_id, round_id, table_index, match_id, status, winner_player_id, result_json) VALUES (@t,@rid,@ti,NULL,@s,NULL,@rj) RETURNING id').get({
      t: tid,
      rid: roundId,
      ti: 1,
      s: 'pending',
      rj: JSON.stringify({ seats }),
    });
    tables.push({ id: row?.id, tableIndex: 1, seats });
    return { ok: true, round: { id: roundId, roundIndex: nextRoundIndex }, tables, tournament: tournamentGet({ id: tid }) };
  }

  const nextRoundIndex = lastRoundIndex + 1;
  const now = nowMs();
  const round = db.prepare('INSERT INTO tournament_rounds (tournament_id, round_index, status, created_at) VALUES (@t,@r,@s,@c) RETURNING id').get({ t: tid, r: nextRoundIndex, s: 'pending', c: now });
  const roundId = round?.id;

  const tables = [];
  let tableIndex = 1;

  const scheduleGroup = (ids) => {
    const groupIds = [...ids];
    shuffleInPlace(groupIds);
    for (let i = 0; i < groupIds.length;) {
      const remaining = groupIds.length - i;
      if (remaining === 1) break; // bye
      const size = Math.min(tableSize, remaining);
      const slice = groupIds.slice(i, i + size);
      const seats = slice.map((pid, idx) => ({ seat: idx, playerId: pid, name: nameById.get(pid) || null }));
      const row = db.prepare('INSERT INTO tournament_tables (tournament_id, round_id, table_index, match_id, status, winner_player_id, result_json) VALUES (@t,@rid,@ti,NULL,@s,NULL,@rj) RETURNING id').get({
        t: tid,
        rid: roundId,
        ti: tableIndex,
        s: 'pending',
        rj: JSON.stringify({ seats }),
      });
      tables.push({ id: row?.id, tableIndex, seats });
      tableIndex++;
      i += size;
    }
  };

  // Winners (0-loss) bracket first, then 1-loss bracket.
  scheduleGroup(survivors0);
  scheduleGroup(survivors1);

  if (!tables.length) return { ok: false, error: 'no_tables' };

  return { ok: true, round: { id: roundId, roundIndex: nextRoundIndex }, tables, tournament: tournamentGet({ id: tid }) };
}

// --- bugreports ---
export function bugreportInsert({
  matchId,
  playerId,
  name,
  contact,
  text,
  contextJson,
  userAgent,
  url,
} = {}) {
  const db = sqlite;
  const now = nowMs();
  const row = db.prepare(`
    INSERT INTO bugreports (created_at, status, match_id, player_id, name, contact, text, context_json, user_agent, url)
    VALUES (@created_at, 'new', @match_id, @player_id, @name, @contact, @text, @context_json, @user_agent, @url)
    RETURNING id
  `).get({
    created_at: now,
    match_id: matchId ? String(matchId) : null,
    player_id: playerId ? String(playerId) : null,
    name: name ? String(name) : null,
    contact: contact ? String(contact) : null,
    text: String(text || '').slice(0, 4000),
    context_json: contextJson ? String(contextJson).slice(0, 20000) : null,
    user_agent: userAgent ? String(userAgent).slice(0, 512) : null,
    url: url ? String(url).slice(0, 512) : null,
  });
  return { ok: true, id: row?.id ?? null };
}

export function bugreportsList({ limit = 50, offset = 0, status = null } = {}) {
  const db = sqlite;
  const lim = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
  const off = Math.max(0, Number.parseInt(offset, 10) || 0);
  const st = status ? String(status) : null;
  const where = st ? 'WHERE status=@status' : '';
  const rows = db.prepare(`SELECT * FROM bugreports ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all({
    status: st,
    limit: lim,
    offset: off,
  });
  const totalRow = db.prepare(`SELECT COUNT(*) as n FROM bugreports ${where}`).get({ status: st });
  return { ok: true, total: totalRow?.n ?? 0, rows };
}

export function bugreportSetStatus({ id, status } = {}) {
  const db = sqlite;
  const sid = Number.parseInt(id, 10);
  const st = String(status || '').trim();
  if (!Number.isFinite(sid)) return { ok: false, error: 'bad_id' };
  if (!['new','seen','done'].includes(st)) return { ok: false, error: 'bad_status' };
  db.prepare('UPDATE bugreports SET status=@s WHERE id=@id').run({ s: st, id: sid });
  return { ok: true };
}

