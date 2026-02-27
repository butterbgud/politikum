import { Server, Origins, FlatFile } from 'boardgame.io/dist/cjs/server.js';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const NEWS_PATH = process.env.NEWS_PATH || path.join(process.cwd(), 'NEWS.md');

import { createMatch as createBgioMatch } from 'boardgame.io/dist/cjs/internal.js';
import { CitadelGame } from './Game.js';
import { recordGameFinished, getSummary, getGames, getGameByMatchId, getLeaderboard, getPublicProfile, setUserBio, authCreateSession, authGetSession, authRegisterOrLogin, authChangeToken, eloRecomputeAll, adminMergePlayerIds, tournamentsList, tournamentGet, tournamentTablesList, tournamentBracketGet, tournamentTableGet, tournamentTableSetMatch, tournamentTableSetResult, tournamentCreate, tournamentSetStatus, tournamentJoin, tournamentLeave, tournamentGenerateRound1 } from './db.js';
import { lobbyChatList, lobbyChatInsert, lobbyChatSetEnabled, lobbyChatClear, lobbyChatIsEnabled } from './lobbyChat.js';

function clampLimit(v, dflt, max) {
  const n = Number.parseInt(v ?? String(dflt), 10) || dflt;
  return Math.min(max, Math.max(1, n));
}

let lastAdminSyncAt = null;

// Persist boardgame.io matches across restarts (required for tournament result sync).
const FLATFILE_DIR = process.env.FLATFILE_DIR || path.join(process.cwd(), 'var', 'bgio');
try { fs.mkdirSync(FLATFILE_DIR, { recursive: true }); } catch {}

const PROFILE_IMG_DIR = process.env.PROFILE_IMG_DIR || path.join(process.cwd(), 'var', 'profile_images');
try { fs.mkdirSync(PROFILE_IMG_DIR, { recursive: true }); } catch {}

const server = Server({
  games: [CitadelGame],
  db: new FlatFile({ dir: FLATFILE_DIR }),
  origins: [
    Origins.LOCALHOST_IN_DEVELOPMENT,
    // Current LAN (router reshuffle)
    "http://192.168.8.14:5177",
    "http://192.168.8.14:5176",
    "http://192.168.8.14:5174",
    "http://192.168.8.14:5173",

    // Old LAN / fallback
    "http://192.168.0.11:5173",
    "http://192.168.0.11:5174",
    "http://192.168.0.11:5175",
    "http://192.168.0.11:5176",

    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",

    // Public VPS (IP-only)
    "http://89.167.103.6",
    "http://89.167.103.6:80"
  ],
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "12qw12";

const BETA_PASSWORDS_RAW = process.env.BETA_PASSWORDS || process.env.BETA_PASSWORD || '';
const BETA_PASSWORDS = String(BETA_PASSWORDS_RAW)
  .split(/[\s,]+/g)
  .map((s) => String(s || '').trim())
  .filter(Boolean);

function requireAdmin(ctx) {
  if (!ADMIN_TOKEN) ctx.throw(401, 'Unauthorized');
  const header = ctx.request.headers['x-admin-token'];
  if (!header || header !== ADMIN_TOKEN) ctx.throw(401, 'Unauthorized');
}

function requireAuth(ctx) {
  const auth = String(ctx.request.headers['authorization'] || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const sess = authGetSession(token);
  if (!sess) ctx.throw(401, 'Unauthorized');
  return sess;
}

async function syncFinishedGames(db) {
  // Pragmatic: whenever an admin endpoint is hit, scan finished matches
  // from the boardgame.io storage and persist them idempotently.
  // NOTE: some storage backends don't implement listMatches(where:{isGameover:true}) reliably,
  // so we list all and filter ourselves.
  const gameName = CitadelGame?.name ?? 'politikum';
  const matchIds = await db.listMatches({ gameName });

  for (const matchId of matchIds) {
    const { state, metadata, initialState } = await db.fetch(matchId, {
      state: true,
      metadata: true,
      initialState: true,
    });

    if (!metadata) continue;

    const isGameover = Boolean(metadata.gameover || state?.ctx?.gameover);
    if (!isGameover) continue;

    const finishedAt = metadata.gameover?.finishedAt ?? metadata.updatedAt ?? Date.now();
    const createdAt = metadata.createdAt ?? initialState?.ctx?.turnStart ?? finishedAt;

    const seatWinnerPlayerId = state?.ctx?.gameover?.winnerPlayerId ?? metadata.gameover?.winnerPlayerId;
    const winnerName = state?.ctx?.gameover?.winnerName ?? metadata.gameover?.winnerName;

    const players = Array.isArray(metadata.players)
      ? metadata.players
      : Object.values(metadata.players || {});

    const statePlayers = Array.isArray(state?.G?.players) ? state.G.players : [];
    const activeIds = new Set((state?.G?.activePlayerIds || []).map(String));

    const seatToStable = (seatId) => {
      const sp = statePlayers.find((x) => String(x?.id) === String(seatId));
      return sp?.identity?.playerId || null;
    };

    const winnerPlayerId = seatWinnerPlayerId ? (seatToStable(seatWinnerPlayerId) || String(seatWinnerPlayerId)) : null;

    const playerSummaries = players
      .map((p, index) => {
        const seatId = String(p.id ?? String(index));
        const sp = statePlayers.find((x) => String(x?.id) === seatId);
        const stable = sp?.identity?.playerId;
        const name = p.name ?? p.displayName ?? sp?.name ?? null;
        const isBot = Boolean(p.isBot || p.bot || sp?.isBot || String(sp?.name || '').startsWith('[B]'));
        const active = Boolean(sp?.active) || activeIds.has(seatId);
        return { seatId, playerId: stable || seatId, name, isBot, active };
      })
      .filter((p) => p.active)
      .filter((p) => {
        const n = String(p.name || '').trim();
        if (!n) return false;
        if (n.startsWith('[H] Seat')) return false;
        return true;
      })
      .map(({ playerId, name, isBot }) => ({ playerId, name, isBot }));

    const durationMs = finishedAt && createdAt ? finishedAt - createdAt : null;

    recordGameFinished({
      matchId,
      createdAt,
      finishedAt,
      durationMs,
      appVersion: process.env.APP_VERSION || null,
      engineVersion: process.env.ENGINE_VERSION || null,
      players: playerSummaries,
      winnerPlayerId: winnerPlayerId ?? null,
      winnerName: winnerName ?? null,
      resultJson: JSON.stringify({
        metadata,
        gameover: state?.ctx?.gameover ?? null,
      }),
    });

    // If this match belongs to a tournament table, persist the result back into tournament_tables.
    // This makes tournament results appear automatically whenever we run syncFinishedGames().
    try {
      const tmeta = metadata?.tournament;
      const tid = tmeta?.id == null ? null : String(tmeta.id || '').trim();
      const tableId = tmeta?.tableId;
      if (tid && tableId != null) {
        const tb = tournamentTableGet({ tournamentId: tid, tableId });
        const seats = Array.isArray(tb?.seats) ? tb.seats : [];

        // If winnerPlayerId is still a seat id, map it to stable playerId from table seats.
        let winnerStable = winnerPlayerId ?? null;
        try {
          const sid = String(winnerStable ?? '').trim();
          const n = Number.parseInt(sid, 10);
          if (Number.isFinite(n)) {
            const seat = seats.find((s) => Number(s?.seat) === n);
            if (seat?.playerId) winnerStable = String(seat.playerId);
          }
        } catch {}

        tournamentTableSetResult({
          tournamentId: tid,
          tableId,
          winnerPlayerId: winnerStable,
          result: {
            matchId,
            finishedAt,
            winnerPlayerId: winnerStable,
            winnerName: winnerName ?? null,
            seats: seats.length ? seats : null,
            autoSynced: true,
          },
        });
      }
    } catch {}

  }
  lastAdminSyncAt = Date.now();
}

async function getStorageStats(db) {
  const gameName = CitadelGame?.name ?? 'politikum';
  const matchIds = await db.listMatches({ gameName });
  let finished = 0;
  let inProgress = 0;
  for (const matchId of matchIds) {
    try {
      const { metadata, state } = await db.fetch(matchId, { metadata: true, state: true });
      const isGameover = Boolean(metadata?.gameover || state?.ctx?.gameover);
      if (isGameover) finished++;
      else inProgress++;
    } catch {}
  }
  return {
    storageTotal: matchIds.length,
    storageFinished: finished,
    storageInProgress: inProgress,
  };
}

async function listInProgressMatches(db, limit = 20) {
  // Some storage backends don't implement where:{isGameover:false} reliably.
  const gameName = CitadelGame?.name ?? 'politikum';
  const matchIds = await db.listMatches({ gameName });

  const items = [];
  let totalInProgress = 0;

  for (const matchId of matchIds) {
    try {
      const { metadata, state } = await db.fetch(matchId, { metadata: true, state: true });
      if (!metadata) continue;
      const isGameover = Boolean(metadata.gameover || state?.ctx?.gameover);
      if (isGameover) continue;

      totalInProgress++;
      if (items.length >= limit) continue;

      // Prefer live state for active filtering (metadata often includes all seats).
      const statePlayers = Array.isArray(state?.G?.players) ? state.G.players : [];
      const activeIds = new Set((state?.G?.activePlayerIds || []).map(String));

      const players = (statePlayers.length ? statePlayers : (
        Array.isArray(metadata.players) ? metadata.players : Object.values(metadata.players || {})
      ))
        .map((p, index) => ({
          seatId: String(p?.id ?? String(index)),
          name: p?.name ?? p?.displayName ?? null,
          isBot: Boolean(p?.isBot || p?.bot || String(p?.name || '').startsWith('[B]')),
          active: Boolean(p?.active) || activeIds.has(String(p?.id ?? String(index))),
        }))
        .filter((p) => p.active)
        .filter((p) => {
          const n = String(p.name || '').trim();
          if (!n) return false;
          if (n.startsWith('[H] Seat')) return false;
          return true;
        })
        .map((p) => ({
          playerId: p.seatId,
          name: p.name,
          isBot: p.isBot,
        }));

      items.push({
        matchId,
        createdAt: metadata.createdAt ?? null,
        updatedAt: metadata.updatedAt ?? null,
        players,
      });
    } catch {}
  }

  return {
    total: totalInProgress,
    items,
  };
}

function killMatchFlatFile(matchId) {
  const dir = FLATFILE_DIR;
  let removed = 0;
  let errors = 0;
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fp = path.join(dir, f);
      try {
        const raw = fs.readFileSync(fp, 'utf8');
        const j = JSON.parse(raw);
        const k = String(j?.key || '');
        if (k.startsWith(String(matchId) + ':')) {
          fs.unlinkSync(fp);
          removed++;
        }
      } catch {
        errors++;
      }
    }
  } catch {
    // no dir, nothing to delete
  }
  return { removed, errors };
}

const PORT = Number.parseInt(process.env.PORT || '8000', 10);

server.run({ port: PORT, host: '0.0.0.0' }, () => {
  const { app } = server;

  // JSON body parsing for auth endpoints.
  app.use(async (ctx, next) => {
    try {
      if (ctx.method === 'POST') {
        const ct = String(ctx.request.headers['content-type'] || '');
        if (ct.includes('application/json')) {
          const chunks = [];
          for await (const ch of ctx.req) chunks.push(ch);
          const raw = Buffer.concat(chunks).toString('utf8') || '{}';
          ctx.request.body = JSON.parse(raw);
        }
      }
    } catch {
      ctx.throw(400, 'Invalid JSON');
    }
    await next();
  });

  app.use(async (ctx, next) => {
    if (ctx.path === '/admin/summary' && ctx.method === 'GET') {
      requireAdmin(ctx);
      await syncFinishedGames(ctx.db);
      const live = await listInProgressMatches(ctx.db, 20);
      const storage = await getStorageStats(ctx.db);
      ctx.body = {
        ...getSummary(),
        ...storage,
        liveInProgressTotal: live.total,
        lastAdminSyncAt,
      };
      return;
    }

    if (ctx.path === '/admin/sync' && ctx.method === 'POST') {
      requireAdmin(ctx);
      await syncFinishedGames(ctx.db);
      const storage = await getStorageStats(ctx.db);
      ctx.body = {
        ok: true,
        ...getSummary(),
        ...storage,
        lastAdminSyncAt,
      };
      return;
    }

    if (ctx.path === '/admin/players/merge' && ctx.method === 'POST') {
      requireAdmin(ctx);
      const body = ctx.request.body || {};
      const res = adminMergePlayerIds({
        fromPlayerId: body.fromPlayerId,
        intoPlayerId: body.intoPlayerId,
      });
      ctx.body = res;
      return;
    }

    if (ctx.path === '/admin/elo/recompute' && ctx.method === 'POST') {
      requireAdmin(ctx);
      eloRecomputeAll();
      ctx.body = { ok: true, leaderboard: getLeaderboard({ limit: 50 }) };
      return;
    }

    if (ctx.path === '/admin/games' && ctx.method === 'GET') {
      requireAdmin(ctx);
      await syncFinishedGames(ctx.db);

      const limit = Math.min(
        200,
        Number.parseInt(ctx.query.limit ?? '50', 10) || 50,
      );
      const offset = Number.parseInt(ctx.query.offset ?? '0', 10) || 0;

      ctx.body = getGames({ limit, offset });
      return;
    }

    if (ctx.path === '/admin/matches' && ctx.method === 'GET') {
      requireAdmin(ctx);
      const limit = Math.min(50, Number.parseInt(ctx.query.limit ?? '20', 10) || 20);
      const body = await listInProgressMatches(ctx.db, limit);

      // Auto-prune disabled (was too dangerous; could wipe active games if admin page is open).

      ctx.body = body;
      return;
    }

    {
      const m = String(ctx.path || '').match(/^\/admin\/match\/([^\/]+)\/log$/);
      if (m && ctx.method === 'GET') {
        requireAdmin(ctx);
        const matchId = String(m[1] || '');
        const limit = clampLimit(ctx.query.limit, 200, 1000);

        let state = null;
        let metadata = null;
        let fetchError = null;
        try {
          const fetched = await ctx.db.fetch(matchId, { metadata: true, state: true });
          metadata = fetched?.metadata ?? null;
          state = fetched?.state ?? null;
        } catch (e) {
          fetchError = e?.message || String(e);
        }

        const log = Array.isArray(state?.G?.log) ? state.G.log : [];
        const tail = log.slice(Math.max(0, log.length - limit));

        // Fallback: if match is missing from boardgame.io storage (FlatFile), try SQLite record.
        let dbGame = null;
        try { dbGame = getGameByMatchId(matchId); } catch {}
        let dbParsed = null;
        try { dbParsed = dbGame?.resultJson ? JSON.parse(dbGame.resultJson) : null; } catch { dbParsed = null; }

        ctx.body = {
          ok: true,
          matchId,
          foundInStorage: !!(state || metadata),
          fetchError,
          meta: {
            createdAt: metadata?.createdAt ?? dbParsed?.metadata?.createdAt ?? dbGame?.createdAt ?? null,
            updatedAt: metadata?.updatedAt ?? dbParsed?.metadata?.updatedAt ?? null,
            gameover: metadata?.gameover ?? dbParsed?.metadata?.gameover ?? null,
          },
          ctx: state?.ctx ?? dbParsed?.gameover ?? null,
          pending: state?.G?.pending ?? null,
          response: state?.G?.response ?? null,
          log: tail,
          logTotal: log.length,
          db: dbGame ? { hasRecord: true, winnerName: dbGame.winnerName ?? null, finishedAt: dbGame.finishedAt ?? null } : { hasRecord: false },
        };
        return;
      }
    }

    {
      const m = String(ctx.path || '').match(/^\/admin\/match\/([^\/]+)\/kill$/);
      if (m && ctx.method === 'POST') {
        requireAdmin(ctx);
        const matchId = m[1];
        const r = killMatchFlatFile(matchId);
        ctx.body = { ok: true, matchId, ...r };
        return;
      }
    }

    if (ctx.path === '/admin/leaderboard' && ctx.method === 'GET') {
      requireAdmin(ctx);
      await syncFinishedGames(ctx.db);
      const limit = clampLimit(ctx.query.limit, 20, 200);
      ctx.body = getLeaderboard({ limit });
      return;
    }



    // Public: news (markdown)
    if (ctx.path === '/public/news' && ctx.method === 'GET') {
      try {
        const raw = fs.readFileSync(NEWS_PATH, 'utf8');
        ctx.body = { ok: true, markdown: raw };
      } catch (e) {
        ctx.body = { ok: false, markdown: '' };
      }
      return;
    }

    // Tournaments (public)
    if (ctx.path === '/public/tournaments' && ctx.method === 'GET') {
      const includeFinished = String(ctx.query.includeFinished || '') === '1';
      ctx.body = tournamentsList({ includeFinished });
      return;
    }

    {
      const m = String(ctx.path || '').match(/^\/public\/tournament\/([^\/]+)$/);
      if (m && ctx.method === 'GET') {
        const t = tournamentGet({ id: m[1] });
        if (!t) ctx.throw(404, 'Not found');
        ctx.body = { ok: true, tournament: t };
        return;
      }
    }

    {
      const m = String(ctx.path || '').match(/^\/public\/tournament\/([^\/]+)\/tables$/);
      if (m && ctx.method === 'GET') {
        const round = Number.parseInt(String(ctx.query.round || '1'), 10) || 1;
        try { await syncFinishedGames(ctx.db); } catch {}
        const res = tournamentTablesList({ id: m[1], roundIndex: round });
        if (!res.ok) ctx.throw(404, res.error || 'Not found');
        ctx.body = res;
        return;
      }
    }

    {
      const m = String(ctx.path || '').match(/^\/public\/tournament\/([^\/]+)\/table\/(\d+)\/sync_result$/);
      if (m && ctx.method === 'POST') {
        const tid = String(m[1]);
        const tableId = Number(m[2]);
        const table = tournamentTableGet({ tournamentId: tid, tableId });
        if (!table) ctx.throw(404, 'Not found');
        const matchId = table.matchId;
        if (!matchId) ctx.throw(409, 'no_match');

        // NOTE: boardgame.io default storage is in-memory; if the server restarted, the match may be gone.
        // In that case, we can't sync from server state.
        const { metadata, state } = await ctx.db.fetch(matchId, { metadata: true, state: true });
        const isGameover = Boolean(metadata?.gameover || state?.ctx?.gameover);
        if (!isGameover) ctx.throw(409, 'not_finished');

        const seatWinner = state?.ctx?.gameover?.winnerPlayerId ?? metadata?.gameover?.winnerPlayerId;
        let winnerStable = seatWinner == null ? null : String(seatWinner);
        try {
          const n = Number.parseInt(String(winnerStable || ''), 10);
          if (Number.isFinite(n)) {
            const seat = (table.seats || []).find((s) => Number(s?.seat) === n);
            if (seat?.playerId) winnerStable = String(seat.playerId);
          }
        } catch {}

        const finishedAt = metadata?.gameover?.finishedAt ?? metadata?.updatedAt ?? Date.now();
        tournamentTableSetResult({
          tournamentId: tid,
          tableId,
          winnerPlayerId: winnerStable,
          result: {
            matchId,
            finishedAt,
            winnerPlayerId: winnerStable,
            winnerName: metadata?.gameover?.winnerName ?? null,
            seats: table.seats || null,
          },
        });

        ctx.body = { ok: true, matchId, winnerPlayerId: winnerStable };
        return;
      }
    }

    {
      const m = String(ctx.path || '').match(/^\/admin\/tournament\/([^\/]+)\/table\/(\d+)\/set_winner$/);
      if (m && ctx.method === 'POST') {
        requireAdmin(ctx);
        const tid = String(m[1]);
        const tableId = Number(m[2]);
        const table = tournamentTableGet({ tournamentId: tid, tableId });
        if (!table) ctx.throw(404, 'Not found');
        const body = ctx.request.body || {};
        const seatIdx = body.seat == null ? null : Number(body.seat);
        if (seatIdx == null || !Number.isFinite(seatIdx)) ctx.throw(400, 'bad_seat');
        const seat = (table.seats || []).find((s) => Number(s?.seat) === seatIdx);
        if (!seat?.playerId) ctx.throw(400, 'seat_missing_player');
        tournamentTableSetResult({
          tournamentId: tid,
          tableId,
          winnerPlayerId: String(seat.playerId),
          result: {
            matchId: table.matchId || null,
            finishedAt: Date.now(),
            winnerPlayerId: String(seat.playerId),
            winnerName: seat.name || null,
            seats: table.seats || null,
            manual: true,
          },
        });
        ctx.body = { ok: true };
        return;
      }
    }

    {
      const m = String(ctx.path || '').match(/^\/public\/tournament\/([^\/]+)\/bracket$/);
      if (m && ctx.method === 'GET') {
        const res = tournamentBracketGet({ id: m[1] });
        if (!res.ok) ctx.throw(404, res.error || 'Not found');
        ctx.body = res;
        return;
      }
    }

    {
      const m = String(ctx.path || '').match(/^\/public\/tournament\/([^\/]+)\/(join|leave)$/);
      if (m && ctx.method === 'POST') {
        const tid = m[1];
        const action = m[2];
        const auth = String(ctx.request.headers['authorization'] || '');
        const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
        const sess = authGetSession(token);
        if (!sess) ctx.throw(401, 'Unauthorized');

        if (action === 'join') {
          const body = ctx.request.body || {};
          const name = (body.name == null) ? null : String(body.name || '').trim();
          const res = tournamentJoin({ id: tid, playerId: sess.playerId, name: name || sess.email || null });
          if (!res.ok) ctx.throw(409, res.error || 'join_failed');
          ctx.body = res;
          return;
        }
        if (action === 'leave') {
          const res = tournamentLeave({ id: tid, playerId: sess.playerId });
          if (!res.ok) ctx.throw(409, res.error || 'leave_failed');
          ctx.body = res;
          return;
        }
      }
    }

    // Tournaments (admin)
    if (ctx.path === '/admin/tournament/create' && ctx.method === 'POST') {
      requireAdmin(ctx);
      const body = ctx.request.body || {};
      ctx.body = tournamentCreate(body);
      return;
    }

    {
      const m = String(ctx.path || '').match(/^\/admin\/tournament\/([^\/]+)\/(open_registration|close_registration|cancel|generate_round1)$/);
      if (m && ctx.method === 'POST') {
        requireAdmin(ctx);
        const tid = m[1];
        const action = m[2];

        if (action === 'generate_round1') {
          const res = tournamentGenerateRound1({ id: tid });
          if (!res.ok) ctx.throw(409, res.error || 'generate_failed');
          ctx.body = res;
          return;
        }

        const status = action === 'open_registration' ? 'registering' : action === 'close_registration' ? 'running' : 'canceled';
        const res = tournamentSetStatus({ id: tid, status });
        if (!res.ok) ctx.throw(404, res.error || 'not_found');
        ctx.body = res;
        return;
      }
    }

    {
      const m = String(ctx.path || '').match(/^\/admin\/tournament\/([^\/]+)\/table\/(\d+)\/create_match$/);
      if (m && ctx.method === 'POST') {
        requireAdmin(ctx);
        const tid = m[1];
        const tableId = Number(m[2]);

        const table = tournamentTableGet({ tournamentId: tid, tableId });
        if (!table) ctx.throw(404, 'Not found');
        if (table.matchId) ctx.throw(409, 'match_exists');

        const seats = Array.isArray(table.seats) ? table.seats : [];
        const numPlayers = Math.max(2, seats.length || 0);
        const matchId = `t_${tid}_${tableId}_${Date.now().toString(36)}`;

        const match = createBgioMatch({
          game: CitadelGame,
          unlisted: true,
          numPlayers,
          setupData: undefined,
        });
        if ('setupDataError' in match) ctx.throw(400, 'setupData_required');

        const { metadata, initialState } = match;
        for (let i = 0; i < numPlayers; i++) {
          const seat = seats[i];
          const name = seat?.name == null ? null : String(seat.name || '').trim();
          const playerId = seat?.playerId == null ? null : String(seat.playerId || '').trim();
          // IMPORTANT: do NOT prefill metadata.players[i].name — LobbyClient.joinMatch treats named seats as taken.
          // Keep the intended identity in metadata.players[i].data so the UI can claim the reserved seat.
          if (playerId || name) metadata.players[i].data = { playerId: playerId || null, name: name || null };
        }
        metadata.tournament = { id: tid, tableId };

        await ctx.db.createMatch(matchId, { initialState, metadata });

        const res = tournamentTableSetMatch({ tournamentId: tid, tableId, matchId, status: 'ready' });
        if (!res.ok) ctx.throw(404, res.error || 'not_found');

        ctx.body = { ok: true, matchId };
        return;
      }
    }

    // Public leaderboard: safe to embed in lobby screen (no token).
    if (ctx.path === '/public/leaderboard' && ctx.method === 'GET') {
      const limit = clampLimit(ctx.query.limit, 10, 50);
      ctx.body = getLeaderboard({ limit });
      return;
    }

    // Public player profile JSON (MVP): rating + games + wins.
    {
      const m = String(ctx.path || '').match(/^\/public\/profile\/([^\/]+)$/);
      if (m && ctx.method === 'GET') {
        const pid = decodeURIComponent(m[1] || '');
        const res = getPublicProfile({ playerId: pid });
        if (!res?.ok) ctx.throw(400, res?.error || 'bad_args');
        ctx.body = res;
        return;
      }
    }

    // Public profile image (JPEG)
    {
      const m = String(ctx.path || '').match(/^\/public\/profile_image\/([^\/]+)\.jpg$/);
      if (m && ctx.method === 'GET') {
        const pid = decodeURIComponent(m[1] || '');
        const imgPath = path.join(PROFILE_IMG_DIR, `${String(pid)}.jpg`);
        if (!fs.existsSync(imgPath)) ctx.throw(404, 'not_found');
        ctx.type = 'image/jpeg';
        ctx.body = fs.createReadStream(imgPath);
        return;
      }
    }

    // Public profile page (pretty HTML): safe to open in a browser.
    {
      const m = String(ctx.path || '').match(/^\/profile\/([^\/]+)$/);
      if (m && ctx.method === 'GET') {
        const pid = decodeURIComponent(m[1] || '');
        const res = getPublicProfile({ playerId: pid });
        if (!res?.ok) ctx.throw(400, res?.error || 'bad_args');

        const name = String(res.name || res.username || res.playerId || '').trim();
        const rating = Math.round(Number(res.rating || 0));
        const games = Number(res.games || 0);
        const wins = Number(res.wins || 0);
        const winRate = games ? Math.round((wins / Math.max(1, games)) * 100) : 0;
        const bioText = String(res.bioText || '').trim();

        // pick a pseudo-random persona art based on playerId (stable per player)
        const hash = (() => {
          const s = String(res.playerId || '');
          let h = 2166136261;
          for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          return (h >>> 0);
        })();
        const personaN = 1 + (hash % 45);
        const fallbackImg = `/cards/persona_${personaN}.webp`;
        const userImg = `/public/profile_image/${encodeURIComponent(String(res.playerId || ''))}.jpg`;
        const img = userImg;

        ctx.type = 'text/html; charset=utf-8';
        ctx.body = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${name || 'Profile'} · Politikum</title>
  <style>
    :root { --bg:#0b0f17; --card:#101826; --muted:rgba(255,255,255,.6); --gold:#f5d17a; }
    body{ background-image: url('/assets/lobby_bg.webp'), radial-gradient(1200px 600px at 20% 0%, rgba(245,209,122,.12), transparent 55%); background-size: cover, auto; background-position: center, 0 0; background-attachment: fixed, fixed; background-repeat: no-repeat, no-repeat; }

    *{box-sizing:border-box} body{margin:0; color:#fff; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;}
    .wrap{min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;}
    .panel{width:min(960px, 96vw); background:rgba(16,24,38,.82); border:1px solid rgba(245,209,122,.18); border-radius:20px; overflow:hidden; box-shadow:0 30px 120px rgba(0,0,0,.55);}
    .hero{display:grid; grid-template-columns: 280px 1fr; gap:18px; padding:18px; background:linear-gradient(180deg, rgba(255,255,255,.04), transparent);}
    .art{border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,.10); background:#000; aspect-ratio: 2/3; width:100%; max-width:280px;}
    .art img{width:100%; height:100%; object-fit:cover; display:block;}
    .title{display:flex; flex-direction:column; gap:8px; padding-top:6px;}
    .name{font-weight:900; font-size:22px; letter-spacing:.02em}
    .sub{color:var(--muted); font-size:12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .stats{display:none;}
    .stat{display:none;}
    .artWrap{position:relative;}
    .artTop{position:absolute; left:10px; right:10px; top:10px; z-index:2; display:flex; justify-content:center;}
    .pill{background:rgba(0,0,0,.55); border:1px solid rgba(245,209,122,.18); border-radius:0; padding:8px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-weight:900; font-size:16px; color:rgba(255,255,255,.88); letter-spacing:.04em; box-shadow:none; white-space:nowrap;}
    .bio{margin-top:12px; padding:12px; border-radius:14px; background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.08);}
    .bio .k{display:block}
    .bio .text{margin-top:8px; color:rgba(255,255,255,.85); font-size:13px; line-height:1.35; white-space:pre-wrap;}
    .bio textarea{width:100%; min-height:96px; resize:vertical; background:rgba(0,0,0,.25); color:#fff; border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:10px; outline:none; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .bio .row{display:flex; gap:10px; align-items:center; justify-content:space-between;}
    .bio .btn{border:1px solid rgba(245,209,122,.20); background:rgba(0,0,0,.25); color:rgba(255,255,255,.88); padding:10px 12px; border-radius:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; font-size:10px; cursor:pointer;}
    .bio .btn:disabled{opacity:.45; cursor:default;}
    .bio .msg{color:rgba(255,255,255,.70); font-size:12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .k{color:var(--muted); font-size:10px; letter-spacing:.22em; text-transform:uppercase; font-weight:900;}
    .v{margin-top:6px; font-size:18px; font-weight:900; color:var(--gold)}
    .v small{font-size:12px; color:rgba(255,255,255,.75); font-weight:800}
    @media (max-width: 760px){ .hero{grid-template-columns: 160px 1fr;} .stats{grid-template-columns: repeat(2,1fr);} .name{font-size:18px;} }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <div class="hero">
        <div class="art artWrap">
          <div class="artTop"><div class="pill">R:${rating} G:${games} W:${wins} W/R:${winRate}%</div></div>
          <img src="${img}" onerror="this.onerror=null;this.src='${fallbackImg}'" alt="persona_${personaN}" />
        </div>
        <div class="title">
          <div class="name">${name || '—'}</div>
          <div class="sub">playerId: ${String(res.playerId || '')}</div>
          <div class="stats">
            <div class="stat"><div class="k">rating</div><div class="v">${rating}</div></div>
            <div class="stat"><div class="k">games</div><div class="v">${games}</div></div>
            <div class="stat"><div class="k">wins</div><div class="v">${wins}</div></div>
            <div class="stat"><div class="k">win rate</div><div class="v">${winRate}<small>%</small></div></div>
          </div>

          <div class="bio" id="bioBox">
            <div class="row">
              <div class="k">profile</div>
              <div style="display:flex; gap:10px; align-items:center;">
                <label class="btn" id="imgPick" style="display:none; padding:8px 10px; cursor:pointer;">
                  Photo
                  <input id="imgInput" type="file" accept="image/jpeg" style="display:none" />
                </label>
                <button class="btn" id="bioEdit" type="button" style="display:none; padding:8px 10px;">Edit</button>
                <div class="msg" id="bioMsg"></div>
              </div>
            </div>
            <div class="text" id="bioText">${bioText ? bioText.replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''}</div>
            <div id="bioEditor" style="display:none; margin-top:10px;">
              <textarea id="bioInput" maxlength="800" placeholder="Напиши пару строк о себе…"></textarea>
              <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="btn" id="bioSave">Save</button>
                <button class="btn" id="bioCancel" type="button">Cancel</button>
              </div>
            </div>
          </div>

          <script>
            (function(){
              const PROFILE_PID = ${JSON.stringify(String(res.playerId || ''))};
              const bioTextEl = document.getElementById('bioText');
              const bioEditor = document.getElementById('bioEditor');
              const bioInput = document.getElementById('bioInput');
              const bioMsg = document.getElementById('bioMsg');
              const imgPick = document.getElementById('imgPick');
              const imgInput = document.getElementById('imgInput');
              const btnEdit = document.getElementById('bioEdit');
              const btnSave = document.getElementById('bioSave');
              const btnCancel = document.getElementById('bioCancel');

              function setMsg(t){ bioMsg.textContent = t || ''; }
              function showEditor(v){ bioEditor.style.display = v ? '' : 'none'; }

              // If user is logged-in and this is their own profile, enable edit.
              try {
                const tok = String(localStorage.getItem('politikum.authToken') || '');
                if (!tok) return;

                fetch('/auth/me', { headers: { 'Authorization': 'Bearer ' + tok } })
                  .then(r => r.ok ? r.json() : null)
                  .then(j => {
                    const mePid = String(j?.session?.playerId || '');
                    if (!mePid || mePid !== PROFILE_PID) return;

                    // enable edit + image upload
                    if (btnEdit) btnEdit.style.display = '';
                    if (imgPick) imgPick.style.display = '';
                    setMsg('');

                    if (imgInput) {
                      imgInput.addEventListener('change', () => {
                        try {
                          const f = imgInput.files && imgInput.files[0];
                          if (!f) return;
                          if (f.type !== 'image/jpeg') { setMsg('jpeg only'); return; }
                          if (f.size > 1000000) { setMsg('max 1MB'); return; }

                          setMsg('uploading…');
                          const fr = new FileReader();
                          fr.onload = () => {
                            const dataUrl = String(fr.result || '');
                            fetch('/auth/profile/image', {
                              method: 'POST',
                              headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + tok },
                              body: JSON.stringify({ jpegBase64: dataUrl })
                            })
                              .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
                              .then(() => { setMsg('uploaded'); setTimeout(() => window.location.reload(), 350); })
                              .catch(e => { setMsg(e.message || String(e)); });
                          };
                          fr.onerror = () => setMsg('read_failed');
                          fr.readAsDataURL(f);
                        } catch (e) {
                          setMsg(e?.message || String(e));
                        }
                      });
                    }

                    const enterEdit = () => {
                      showEditor(true);
                      bioInput.value = (bioTextEl.textContent || '').trim();
                      bioTextEl.style.display = 'none';
                      setMsg('');
                    };

                    if (btnEdit) btnEdit.addEventListener('click', enterEdit);
                    btnCancel.addEventListener('click', () => {
                      showEditor(false);
                      bioTextEl.style.display = '';
                      setMsg('');
                    });
                    btnSave.addEventListener('click', () => {
                      btnSave.disabled = true;
                      setMsg('saving…');
                      fetch('/auth/profile/bio', {
                        method: 'POST',
                        headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + tok },
                        body: JSON.stringify({ bioText: bioInput.value || '' })
                      })
                        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
                        .then(() => { setMsg('saved'); setTimeout(() => window.location.reload(), 350); })
                        .catch(e => { btnSave.disabled = false; setMsg(e.message || String(e)); });
                    });
                  })
                  .catch(()=>{});
              } catch {}
            })();
          </script>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
        return;
      }
    }

    // Global pre-lobby chat (MVP)
    if (ctx.path === '/public/lobby_chat' && ctx.method === 'GET') {
      const limit = clampLimit(ctx.query.limit, 50, 200);
      ctx.body = lobbyChatList({ limit });
      return;
    }

    if (ctx.path === '/public/lobby_chat/send' && ctx.method === 'POST') {
      const sess = requireAuth(ctx);
      if (!lobbyChatIsEnabled()) {
        ctx.body = { ok: false, error: 'disabled' };
        return;
      }

      // rate-limit per playerId (in-memory)
      globalThis.__politikumLobbyChatRate ||= new Map();
      const rate = globalThis.__politikumLobbyChatRate;
      const key = String(sess.playerId || '');
      const now = Date.now();
      const last = Number(rate.get(key) || 0);
      if (last && (now - last) < 3000) {
        ctx.body = { ok: false, error: 'rate_limited' };
        return;
      }
      rate.set(key, now);

      const body = ctx.request.body || {};
      const text = String(body.text || '').trim();
      const name = String(body.name || body.playerName || '').trim();
      const res = lobbyChatInsert({ playerId: sess.playerId, name: name || null, text });
      ctx.body = res.ok ? { ok: true } : res;
      return;
    }

    if (ctx.path === '/admin/lobby_chat/disable' && ctx.method === 'POST') {
      requireAdmin(ctx);
      ctx.body = lobbyChatSetEnabled(false);
      return;
    }
    if (ctx.path === '/admin/lobby_chat/enable' && ctx.method === 'POST') {
      requireAdmin(ctx);
      ctx.body = lobbyChatSetEnabled(true);
      return;
    }
    if (ctx.path === '/admin/lobby_chat/clear' && ctx.method === 'POST') {
      requireAdmin(ctx);
      ctx.body = lobbyChatClear();
      return;
    }

    // Public: list only matches that are still in lobby phase (not started).
    if (ctx.path === '/public/matches_open' && ctx.method === 'GET') {
      const limit = Math.min(100, Number.parseInt(ctx.query.limit ?? '50', 10) || 50);
      const gameName = CitadelGame?.name ?? 'politikum';
      const matchIds = await ctx.db.listMatches({ gameName });
      const items = [];
      for (const matchId of matchIds) {
        try {
          const { metadata, state } = await ctx.db.fetch(matchId, { metadata: true, state: true });
          if (!metadata || metadata.gameover) continue;
          if (String(state?.ctx?.phase || '') !== 'lobby') continue;
          items.push({
            matchID: matchId,
            updatedAt: metadata.updatedAt ?? null,
            createdAt: metadata.createdAt ?? null,
            setupData: metadata.setupData ?? null,
            players: metadata.players ?? null,
          });
          if (items.length >= limit) break;
        } catch {}
      }
      ctx.body = { matches: items };
      return;
    }

    // Prod auth (MVP): username + token. If username doesn't exist yet, register it.
    if (ctx.path === '/auth/register_or_login' && ctx.method === 'POST') {
      const body = ctx.request.body || {};
      const username = String(body.username || '').trim();
      const token = String(body.token || '');
      const deviceId = (body.deviceId == null) ? null : String(body.deviceId || '').trim();

      // simple in-memory rate limit (per ip+username)
      globalThis.__politikumAuthRate ||= new Map();
      const rate = globalThis.__politikumAuthRate;
      const key = `${String(ctx.request.ip || ctx.ip || '')}:${username.toLowerCase()}`;
      const now = Date.now();
      const last = Number(rate.get(key) || 0);
      if (last && (now - last) < 1500) ctx.throw(429, 'Too many attempts');
      rate.set(key, now);

      try {
        const sess = authRegisterOrLogin({ username, token, deviceId });
        ctx.body = { ok: true, ...sess };
      } catch (e) {
        const status = Number(e?.status || 0) || (String(e?.message || '').includes('invalid_token') ? 401 : 400);
        ctx.status = status;
        ctx.body = { ok: false, error: e?.message || String(e) };
      }
      return;
    }

    // Change token (requires existing session)
    if (ctx.path === '/auth/change_token' && ctx.method === 'POST') {
      const auth = String(ctx.request.headers['authorization'] || '');
      const sessToken = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
      const body = ctx.request.body || {};
      const oldToken = String(body.oldToken || body.old || '');
      const newToken = String(body.newToken || body.new || '');
      try {
        const res = authChangeToken({ sessionToken: sessToken, oldToken, newToken });
        ctx.body = res;
      } catch (e) {
        const status = Number(e?.status || 0) || (String(e?.message || '').includes('unauthorized') ? 401 : 400);
        ctx.status = status;
        ctx.body = { ok: false, error: e?.message || String(e) };
      }
      return;
    }

    // Closed beta auth (legacy): shared password -> session token (stored in localStorage).
    if (ctx.path === '/auth/login' && ctx.method === 'POST') {
      const body = ctx.request.body || {};
      const password = String(body.password || '');
      const email = (body.email == null) ? null : String(body.email || '').trim();
      const deviceId = (body.deviceId == null) ? null : String(body.deviceId || '').trim();
      if (!BETA_PASSWORDS.length) ctx.throw(500, 'BETA_PASSWORDS is not configured');
      if (!password || !BETA_PASSWORDS.includes(password)) ctx.throw(401, 'Invalid password');
      const sess = authCreateSession({ email, deviceId });
      ctx.body = { ok: true, ...sess };
      return;
    }

    if (ctx.path === '/auth/me' && ctx.method === 'GET') {
      const auth = String(ctx.request.headers['authorization'] || '');
      const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
      const sess = authGetSession(token);
      if (!sess) ctx.throw(401, 'Unauthorized');
      ctx.body = { ok: true, session: sess };
      return;
    }

    // Update your public profile bio (requires auth).
    if (ctx.path === '/auth/profile/bio' && ctx.method === 'POST') {
      const sess = requireAuth(ctx);
      const body = ctx.request.body || {};
      const bioText = body.bioText == null ? '' : String(body.bioText);
      ctx.body = setUserBio({ playerId: sess.playerId, bioText });
      return;
    }

    // Upload your public profile image (JPEG only; <=1MB; recompress to <=200KB)
    if (ctx.path === '/auth/profile/image' && ctx.method === 'POST') {
      const sess = requireAuth(ctx);
      const body = ctx.request.body || {};
      const b64 = String(body.jpegBase64 || '').trim();
      if (!b64) ctx.throw(400, 'no_image');

      // allow optional data URL prefix
      const raw = b64.startsWith('data:') ? b64.split(',').slice(1).join(',') : b64;
      let buf = null;
      try { buf = Buffer.from(raw, 'base64'); } catch { ctx.throw(400, 'bad_base64'); }
      if (!buf || !buf.length) ctx.throw(400, 'bad_image');
      if (buf.length > 1_000_000) ctx.throw(413, 'too_large');

      // Validate it's a JPEG.
      const head = buf.slice(0, 3);
      const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      if (!isJpeg) ctx.throw(415, 'jpeg_only');

      // Recompress aggressively to <=200KB.
      let out = null;
      try {
        // resize down if needed (keep reasonable avatar size)
        let img = sharp(buf).rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true });
        for (const q of [82, 74, 66, 58, 50, 42]) {
          const tmp = await img.jpeg({ quality: q, mozjpeg: true }).toBuffer();
          out = tmp;
          if (tmp.length <= 200_000) break;
        }
        if (out && out.length > 200_000) {
          // last resort: smaller
          const tmp = await sharp(out).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 58, mozjpeg: true }).toBuffer();
          out = tmp;
        }
      } catch {
        ctx.throw(400, 'bad_image');
      }

      const outPath = path.join(PROFILE_IMG_DIR, `${String(sess.playerId)}.jpg`);
      try { fs.writeFileSync(outPath, out); } catch { ctx.throw(500, 'write_failed'); }
      ctx.body = { ok: true, bytes: out?.length || 0 };
      return;
    }

    await next();
  });

  console.log(`READY_ON_${PORT}`);
});
