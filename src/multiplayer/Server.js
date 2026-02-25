import { Server, Origins } from 'boardgame.io/dist/cjs/server.js';
import { CitadelGame } from './Game.js';
import { recordGameFinished, getSummary, getGames, getLeaderboard, authCreateSession, authGetSession, eloRecomputeAll, adminMergePlayerIds } from './db.js';

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
const BETA_PASSWORD = process.env.BETA_PASSWORD || '';

function requireAdmin(ctx) {
  if (!ADMIN_TOKEN) {
    ctx.throw(500, 'ADMIN_TOKEN is not configured');
  }
  const header = ctx.request.headers['x-admin-token'];
  if (!header || header !== ADMIN_TOKEN) {
    ctx.throw(401, 'Unauthorized');
  }
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
      if (!BETA_PASSWORD) ctx.throw(500, 'BETA_PASSWORD is not configured');
      if (!password || password !== BETA_PASSWORD) ctx.throw(401, 'Invalid password');
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
