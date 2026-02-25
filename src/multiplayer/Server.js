import { Server, Origins } from 'boardgame.io/dist/cjs/server.js';
import { createMatch as createBgioMatch } from 'boardgame.io/dist/cjs/internal.js';
import { CitadelGame } from './Game.js';
import { recordGameFinished, getSummary, getGames, getLeaderboard, authCreateSession, authGetSession, eloRecomputeAll, adminMergePlayerIds, tournamentsList, tournamentGet, tournamentTablesList, tournamentBracketGet, tournamentTableGet, tournamentTableSetMatch, tournamentCreate, tournamentSetStatus, tournamentJoin, tournamentLeave, tournamentGenerateRound1 } from './db.js';

function clampLimit(v, dflt, max) {
  const n = Number.parseInt(v ?? String(dflt), 10) || dflt;
  return Math.min(max, Math.max(1, n));
}

let lastAdminSyncAt = null;

const server = Server({
  games: [CitadelGame],
  origins: [
    Origins.LOCALHOST_IN_DEVELOPMENT,
    // Current LAN (router reshuffle)
    "http://192.168.8.14:5177",
    "http://192.168.8.14:5176",
    "http://192.168.8.14:5174", 

    // Old LAN / fallback
    "http://192.168.0.11:5173",
    "http://192.168.0.11:5174",
    "http://192.168.0.11:5175",
    "http://192.168.0.11:5176",

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
      ctx.body = await listInProgressMatches(ctx.db, limit);
      return;
    }

    if (ctx.path === '/admin/leaderboard' && ctx.method === 'GET') {
      requireAdmin(ctx);
      await syncFinishedGames(ctx.db);
      const limit = clampLimit(ctx.query.limit, 20, 200);
      ctx.body = getLeaderboard({ limit });
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
        const res = tournamentTablesList({ id: m[1], roundIndex: round });
        if (!res.ok) ctx.throw(404, res.error || 'Not found');
        ctx.body = res;
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

    // Closed beta auth: shared password -> session token (stored in localStorage).
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

    await next();
  });

  console.log(`READY_ON_${PORT}`);
});
