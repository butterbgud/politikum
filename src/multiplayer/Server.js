import { Server, Origins } from 'boardgame.io/dist/cjs/server.js';
import { CitadelGame } from './Game.js';
import { recordGameFinished, getSummary, getGames, getLeaderboard } from './db.js';

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

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

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
  const gameName = CitadelGame?.name ?? 'politikum';
  const matchIds = await db.listMatches({
    gameName,
    where: { isGameover: true },
  });

  for (const matchId of matchIds) {
    const { state, metadata, initialState } = await db.fetch(matchId, {
      state: true,
      metadata: true,
      initialState: true,
    });

    if (!state || !metadata) continue;

    const finishedAt = metadata.gameover?.finishedAt ?? metadata.updatedAt ?? Date.now();
    const createdAt = metadata.createdAt ?? initialState?.ctx?.turnStart ?? finishedAt;

    const winnerPlayerId = state.ctx?.gameover?.winnerPlayerId ?? metadata.gameover?.winnerPlayerId;
    const winnerName = state.ctx?.gameover?.winnerName ?? metadata.gameover?.winnerName;

    const players = Array.isArray(metadata.players)
      ? metadata.players
      : Object.values(metadata.players || {});

    const playerSummaries = players.map((p, index) => ({
      playerId: p.id ?? String(index),
      name: p.name ?? p.displayName ?? null,
      isBot: Boolean(p.isBot || p.bot),
    }));

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
        gameover: state.ctx?.gameover ?? null,
      }),
    });
  }
  lastAdminSyncAt = Date.now();
}

async function listInProgressMatches(db, limit = 20) {
  const gameName = CitadelGame?.name ?? 'politikum';
  const matchIds = await db.listMatches({
    gameName,
    where: { isGameover: false },
  });

  const items = [];
  for (const matchId of matchIds.slice(0, limit)) {
    try {
      const { metadata } = await db.fetch(matchId, { metadata: true });
      if (!metadata) continue;
      const players = Array.isArray(metadata.players)
        ? metadata.players
        : Object.values(metadata.players || {});
      items.push({
        matchId,
        createdAt: metadata.createdAt ?? null,
        updatedAt: metadata.updatedAt ?? null,
        players: players.map((p, index) => ({
          playerId: p.id ?? String(index),
          name: p.name ?? p.displayName ?? null,
          isBot: Boolean(p.isBot || p.bot),
        })),
      });
    } catch {}
  }

  return {
    total: matchIds.length,
    items,
  };
}

const PORT = Number.parseInt(process.env.PORT || '8000', 10);

server.run({ port: PORT, host: '0.0.0.0' }, () => {
  const { app } = server;

  app.use(async (ctx, next) => {
    if (ctx.path === '/admin/summary' && ctx.method === 'GET') {
      requireAdmin(ctx);
      await syncFinishedGames(ctx.db);
      const live = await listInProgressMatches(ctx.db, 20);
      ctx.body = {
        ...getSummary(),
        liveInProgressTotal: live.total,
        lastAdminSyncAt,
      };
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
      const limit = Math.min(200, Number.parseInt(ctx.query.limit ?? '20', 10) || 20);
      ctx.body = getLeaderboard({ limit });
      return;
    }

    await next();
  });

  console.log(`READY_ON_${PORT}`);
});
