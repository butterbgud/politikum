import React, { useEffect, useMemo, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient } from 'boardgame.io/client';
import { CitadelGame as PolitikumGame } from './Game.js';

const SERVER = `http://${window.location.hostname}:8001`;
const lobbyClient = new LobbyClient({ server: SERVER });

const NAMES = [
  'Hakon', 'Rixa', 'Gisela', 'Dunstan', 'Irmgard', 'Cedric', 'Freya', 'Ulric', 'Yolanda', 'Tristan',
  'Beatrix', 'Lambert', 'Maude', 'Odilia', 'Viggo', 'Sibylla', 'Katarina', 'Norbert', 'Quintus',
];

function Card({ card, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'w-32 aspect-[2/3] rounded-2xl overflow-hidden border shadow-2xl transition-transform ' +
        (disabled ? 'opacity-40 cursor-not-allowed border-black/30' : 'cursor-pointer hover:scale-[1.03] border-amber-500/30')
      }
      title={card?.id}
    >
      <img src={card.img} alt={card.id} className="w-full h-full object-cover" draggable={false} />
    </button>
  );
}

function Board({ G, ctx, moves, playerID }) {
  // H toggles on-screen hotkey hints (badges like (c)/(e)/(1..n)).
  const [showHotkeys, setShowHotkeys] = useState(false);
  // Legacy states kept only to avoid touching large JSX blocks.
  // Hotkey/tutorial overlays are hard-disabled below.
  const [showTutorial, setShowTutorial] = useState(false);
  const [pickTargetForAction4, setPickTargetForAction4] = useState(null); // { cardId }
  const logRef = React.useRef(null);
  const me = (G.players || []).find((p) => String(p.id) === String(playerID));
  const isMyTurn = String(ctx.currentPlayer) === String(playerID) && !G.gameOver;
  const current = (G.players || []).find((p) => String(p.id) === String(ctx.currentPlayer));
  const currentIsBot = String(current?.name || '').startsWith('[B]');
  const response = G.response || null;
  const responseKind = response?.kind || null;
  const responseExpiresAt = Number(response?.expiresAtMs || 0);
  const responseSecondsLeft = Math.max(0, Math.ceil((responseExpiresAt - Date.now()) / 1000));
  const responseActive = !!responseKind && responseSecondsLeft > 0;
  const haveAction6 = (me?.hand || []).some((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_6');
  const haveAction8 = (me?.hand || []).some((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_8');
  const [showEventSplash, setShowEventSplash] = useState(false);
  const [showActionSplash, setShowActionSplash] = useState(false);
  const ENABLE_SPLASH = false;

  const [logCollapsed, setLogCollapsed] = useState(false);
  const [hoverHandIndex, setHoverHandIndex] = useState(null);
  const [hoverMyCoalition, setHoverMyCoalition] = useState(null);
  const [hoverOppCoalition, setHoverOppCoalition] = useState({}); // { [playerId]: idx }

  const hand = me?.hand || [];

  const grouped = useMemo(() => {
    const by = { persona: [], action: [], event: [] };
    for (const c of hand) (by[c.type] ||= []).push(c);
    return by;
  }, [hand]);

  const opponents = useMemo(() => {
    return (G.players || []).filter((p) => String(p.id) !== String(playerID));
  }, [G.players, playerID]);

  const myCoalitionPoints = (me?.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0); // MVP scoring

  // Hand fan geometry (ported from Citadel MP)
  const cards = hand;
  const fanN = Math.max(1, cards.length);
  const cardW = 144; // ~ w-36
  const handStep = Math.min(52, Math.max(24, 320 / Math.max(1, fanN - 1)));
  const handWidth = cardW + (fanN - 1) * handStep;

  const scaleByDist = (dist) => {
    if (dist == 0) return 2;
    if (dist == 1) return 1.35;
    if (dist == 2) return 1.15;
    return 1;
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      // ignore typing
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.isComposing) return;

      const key = String(e.key || '').toLowerCase();
      if (key === 'l') {
        setLogCollapsed((v) => !v);
        return;
      }
      if (key === 'h') {
        setShowHotkeys((v) => !v);
        return;
      }
      if (key === 't') {
        setShowTutorial((v) => !v);
        return;
      }
      if (key === 'c') {
        if (!isMyTurn || G.hasDrawn) return;
        moves.drawCard();
        return;
      }
      if (key === 'e') {
        if (!isMyTurn || !G.hasDrawn || !G.hasPlayed) return;
        moves.endTurn();
        return;
      }

      // Fast cancels during response windows
      if (responseActive && key === '1') {
        // action_6 cancels actions
        if (responseKind === 'cancel_action' && String(response?.playedBy) !== String(playerID)) {
          const c6 = (me?.hand || []).find((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_6');
          if (c6) moves.playAction(c6.id);
        }
        // action_8 cancels persona plays
        if (responseKind === 'cancel_persona' && String(response?.playedBy) !== String(playerID)) {
          const c8 = (me?.hand || []).find((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_8');
          if (c8) moves.playAction(c8.id);
        }
        return;
      }

      // Number hotkeys for hand (quick-play): 1..9, 0 = 10
      if (!responseActive && (key === '0' || (key >= '1' && key <= '9'))) {
        const n = key === '0' ? 10 : Number(key);
        const idx = n - 1;
        const card = (me?.hand || [])[idx];
        if (!card) return;

        const baseId = String(card.id).split('#')[0];
        const canPlayPersona = isMyTurn && G.hasDrawn && !G.hasPlayed && card.type === 'persona';
        const canPlayAction = isMyTurn && G.hasDrawn && !G.hasPlayed && card.type === 'action';
        if (canPlayPersona) moves.playPersona(card.id);
        else if (canPlayAction) {
          if (baseId === 'action_4') setPickTargetForAction4({ cardId: card.id });
          else moves.playAction(card.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMyTurn, G.hasDrawn, G.hasPlayed, moves, responseKind, responseSecondsLeft, response?.playedBy, playerID, me?.hand]);

  // Drive bot turns (pacing): tick every 500ms when it's a bot's turn.
  useEffect(() => {
    if (!currentIsBot) return;
    const t = setInterval(() => {
      try { moves.tickBot(); } catch {}
    }, 500);
    return () => clearInterval(t);
  }, [currentIsBot, moves]);

  useEffect(() => {
    const id = G.lastEvent?.id;
    if (!id) return;
    setShowEventSplash(true);
    const t = setTimeout(() => setShowEventSplash(false), 2000);
    return () => clearTimeout(t);
  }, [G.lastEvent?.id]);

  // Autoscroll log to bottom on new lines
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    // next tick so layout updates first
    const t = setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 0);
    return () => clearTimeout(t);
  }, [(G.log || []).length]);

  useEffect(() => {
    const id = G.lastAction?.id;
    if (!id) return;
    setShowActionSplash(true);
    const t = setTimeout(() => setShowActionSplash(false), 2000);
    return () => clearTimeout(t);
  }, [G.lastAction?.id]);

  return (
    <div className="w-full min-h-screen bg-[url('/assets/ui/table.webp')] bg-cover bg-center text-amber-100">
      <div className="fixed top-3 left-3 z-[2000] select-none">
        <button
          type="button"
          onClick={() => {
            try {
              const full = (typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit');
              navigator.clipboard?.writeText?.(full);
            } catch {}
          }}
          className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-lg px-2 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90"
          title={`app ${typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit'}\nengine ${typeof __ENGINE_GIT_SHA_SHORT__ !== 'undefined' ? __ENGINE_GIT_SHA_SHORT__ : 'nogit'}\n(click to copy full app sha)`}
        >
          {typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'nogit'}@{typeof __GIT_SHA_SHORT__ !== 'undefined' ? __GIT_SHA_SHORT__ : (typeof __GIT_SHA__ !== 'undefined' ? String(__GIT_SHA__).slice(0,7) : 'nogit')}
          {typeof __ENGINE_GIT_SHA_SHORT__ !== 'undefined' ? ` · eng@${__ENGINE_GIT_SHA_SHORT__}` : ''}
        </button>
      </div>

      {/* Opponents */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[700] flex gap-10 pointer-events-none">
        {opponents.map((p) => {
          const hand0 = p.hand || [];
          const coal = (p.coalition || []);
          const nHand = (hand0 || []).length;
          const nCoal = (coal || []).length;
          const nTotal = nHand + nCoal;

          const pts = (coal || []).reduce((s, c) => s + Number(c.vp || 0), 0); // MVP points

          // Single opponent fan: coal face-up + hand face-down in one stack
          // We want: backs VERY tight, faces less tight.
          const backs = Array.from({ length: nHand }, () => ({ kind: 'back' }));
          const faces = coal.map((c) => ({ kind: 'face', card: c }));
          const oppFanCards = [...backs, ...faces];

          const show = Math.min(12, oppFanCards.length);
          const stepBack = 6;  // 2x tighter
          const stepFace = 18; // less tight

          const calcWidth = () => {
            const shown = oppFanCards.slice(0, show);
            let w = 140;
            for (let i = 1; i < shown.length; i++) {
              w += shown[i].kind === 'back' ? stepBack : stepFace;
            }
            return w;
          };
          const width = calcWidth();
          const hoverIdx = hoverOppCoalition?.[p.id] ?? null;

          const scaleByDist2 = (dist) => {
            if (dist === 0) return 1.7;
            if (dist === 1) return 1.2;
            if (dist === 2) return 1.08;
            return 1;
          };

          return (
            <div key={p.id} className="flex flex-col items-center gap-2 relative pt-10">
              {/* name/points as absolute overlay above cards */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/55 border border-amber-900/20 rounded-full px-3 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90 z-[2000]">
                <span>{p.name}</span>
                <span className="text-amber-200/50">•</span>
                <span className="text-amber-200/80">{pts}p</span>
              </div>

              {/* single opponent fan (coalition + hand) */}
              <div
                className="relative h-44 pointer-events-auto"
                style={{ width: Math.max(width, 260) }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const idx = Math.max(0, Math.min(show - 1, Math.round(x / step)));
                  setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: idx }));
                }}
                onMouseLeave={() => setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: null }))}
                title={`Total: ${nTotal}`}
              >
                {/* count */}
                {nTotal > 0 && (
                  <div className="absolute -top-15 left-1/2 -translate-x-1/2 bg-black/70 border border-black/40 text-amber-100 font-mono font-black text-[12px] px-2 py-0.5 rounded-full">{nTotal}</div>
                )}

                {oppFanCards.slice(0, show).map((it, i) => {
                  const t = show <= 1 ? 0.5 : i / (show - 1);
                  const rot = (t - 0.5) * 12;

                  // variable spacing: backs tighter, faces looser
                  const shown = oppFanCards.slice(0, show);
                  let left = 0;
                  for (let k = 0; k < i; k++) {
                    left += (shown[k + 1]?.kind === 'back') ? stepBack : stepFace;
                  }

                  const dist = (hoverIdx == null) ? 99 : Math.abs(i - hoverIdx);
                  const scale = (hoverIdx == null) ? 1 : scaleByDist2(dist);
                  const z = (hoverIdx == null) ? i : (1000 - dist);

                  const img = it.kind === 'back' ? '/assets/backing.jpg' : it.card.img;
                  const id = it.kind === 'back' ? 'back' : it.card.id;
                  return (
                    <div
                      key={`${p.id}-${i}-${id}`}
                      className="absolute bottom-0 w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl"
                      style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: 'bottom center' }}
                      title={id}
                    >
                      <img src={img} alt={id} className="w-full h-full object-cover" draggable={false} />
                      {(it.kind === 'face' && Number(it.card?.vpDelta || 0) < 0) && (
                        <div className="absolute left-2 bottom-2 w-7 h-7 rounded-full bg-red-700/90 border border-red-200/30 flex items-center justify-center text-white font-black text-[13px]">{it.card.vpDelta}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls (Citadel-style touchables) */}
      <div className="fixed inset-0 z-[1100] pointer-events-none">
        {/* Deck (Draw) */}
        <button
          type="button"
          onClick={() => { if (!isMyTurn || G.hasPlayed || (G.drawsThisTurn || 0) >= 2) return; moves.drawCard(); }}
          className={
            "fixed pointer-events-auto select-none outline-none transition-transform duration-150 ease-out hover:-translate-y-1 hover:scale-[1.02] active:translate-y-0 active:scale-[0.99] " +
            ((!isMyTurn || G.hasPlayed || (G.drawsThisTurn || 0) >= 2) ? "opacity-60 cursor-not-allowed hover:translate-y-0 hover:scale-100" : "cursor-pointer")
          }
          style={{ right: 'calc(2% + 148px)', bottom: 'calc(18% - 155px)', width: '172px' }}
          title={((G.drawsThisTurn || 0) >= 2 ? "No more draws" : (G.hasPlayed ? "Already played" : ((G.drawsThisTurn || 0) === 1 ? "Draw 2nd (ends turn)" : "Draw card")))}
          aria-disabled={!isMyTurn || G.hasPlayed || (G.drawsThisTurn || 0) >= 2}
        >
          <div className="relative w-full h-auto">
            {(isMyTurn && !G.hasDrawn) && (
              <img src="/assets/ui/touch_deck_glow.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none animate-pulse" draggable={false} />
            )}
            <img src="/assets/ui/touch_deck.png" alt="Deck" className="w-full h-auto" draggable={false} />
            {showHotkeys && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[12px] font-mono font-black text-amber-200/90 drop-shadow">(c)</div>
            )}
          </div>
        </button>

        {/* Cookies (End Turn) */}
        <button
          type="button"
          onClick={() => { if (!isMyTurn || !G.hasDrawn || !G.hasPlayed) return; moves.endTurn(); }}
          className={
            "fixed pointer-events-auto select-none outline-none transition-transform duration-150 ease-out hover:-translate-y-1 hover:scale-[1.02] active:translate-y-0 active:scale-[0.99] " +
            ((!isMyTurn || !G.hasDrawn || !G.hasPlayed) ? "opacity-60 cursor-not-allowed hover:translate-y-0 hover:scale-100" : "cursor-pointer")
          }
          style={{ right: 'calc(2% - 12px)', top: 'calc(3% - 96px)', width: '280px' }}
          title={(!G.hasDrawn ? "Draw first" : (!G.hasPlayed ? "Play first" : "End turn"))}
          aria-disabled={!isMyTurn || !G.hasDrawn || !G.hasPlayed}
        >
          <div className="relative w-full h-auto">
            <img src="/assets/ui/touch_cookies.png" alt="End Turn" className="w-full h-auto" draggable={false} />
            {showHotkeys && (
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[12px] font-mono font-black text-amber-200/90 drop-shadow">(e)</div>
            )}
          </div>
        </button>
      </div>

      {/* Response window banner */}
      {responseActive && ((responseKind === 'cancel_action' && haveAction6) || (responseKind === 'cancel_persona' && haveAction8)) && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {responseKind === 'cancel_action' ? 'Action played — respond with Action 6 to cancel' : 'Persona played — respond with Action 8 to cancel'}
            <span className="ml-3 text-amber-200/70">{responseSecondsLeft}s</span>
          </div>
        </div>
      )}

      {/* Tutorial overlay (hotkeys overlay removed) */}
      {showTutorial && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/65 backdrop-blur-sm pointer-events-auto" onClick={() => { setShowTutorial(false); }}>
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-6 w-[560px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center">
              <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Tutorial</div>
              <button className="ml-auto text-amber-200/60 hover:text-amber-200 font-black" onClick={() => { setShowTutorial(false); }}>x</button>
            </div>

            <div className="mt-4 text-amber-100/80 text-sm">
              <div className="font-black uppercase tracking-widest text-[11px] text-amber-200/70">Turn</div>
              <div className="mt-1">1) Draw (C)</div>
              <div>2) Play 1 card (click or 1..9/0)</div>
              <div>3) End turn (E)</div>
              <div className="mt-3 text-amber-200/60 text-xs">Press T anytime to show/hide this.</div>
            </div>
          </div>
        </div>
      )}

      {/* Action_4 target picker */}
      {!!pickTargetForAction4 && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto" onClick={() => setPickTargetForAction4(null)}>
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[520px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Choose target</div>
            <div className="mt-2 text-amber-100 font-serif text-xl font-bold">Action 4</div>
            <div className="mt-3 text-amber-100/70 text-sm">Pick an opponent. They will discard 1 coalition card of their choice.</div>
            <div className="mt-4 flex flex-col gap-2">
              {opponents.map((p) => (
                <button
                  key={p.id}
                  className="px-4 py-3 rounded-xl bg-amber-950/40 hover:bg-amber-950/60 border border-amber-900/20 text-left"
                  onClick={() => {
                    moves.playAction(pickTargetForAction4.cardId, String(p.id));
                    setPickTargetForAction4(null);
                  }}
                >
                  <div className="text-amber-100 font-black">{p.name}</div>
                  <div className="text-amber-200/60 text-xs">Coalition: {(p.coalition || []).length}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="text-amber-200/70 hover:text-amber-200 font-black" onClick={() => setPickTargetForAction4(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Action_4 discard prompt (target chooses) */}
      {G.pending?.kind === 'action_4_discard' && String(playerID) === String(G.pending.targetId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[700px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Discard from coalition</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose 1 card from your coalition to discard.</div>
            <div className="mt-4 flex gap-3 flex-wrap">
              {(me?.coalition || []).map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.discardFromCoalition(c.id)}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {G.gameOver && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/65 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-6 w-[520px] max-w-[92vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Game over</div>
            <div className="mt-2 text-amber-100 font-serif text-2xl font-bold">
              Winner: {(G.players || []).find((p) => String(p.id) === String(G.winnerId))?.name || G.winnerId}
            </div>
            {Array.isArray(G.history) && G.history.length >= 2 && (() => {
              const hist = G.history;
              const playerIds = (G.players || []).map((p) => String(p.id));
              const colors = ['#f59e0b', '#22c55e', '#60a5fa', '#f472b6', '#a78bfa'];

              return (
                <>
                  <div className="mt-4 text-amber-100/80 text-sm font-mono whitespace-pre">
                    {(G.players || []).map((p, i) => {
                      const pts = (p.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0);
                      const col = colors[i % colors.length];
                      return (
                        <div key={p.id} style={{ color: col }}>
                          {p.name}: {pts} vp (coalition {(p.coalition || []).length})
                        </div>
                      );
                    })}
                  </div>

                  {/* Score history chart (turn vs VP) */}
                  {(() => {
                    const turns = hist.map((h) => Number(h.turn || 0));
                    const minT = Math.min(...turns);
                    const maxT = Math.max(...turns);

                    const allScores = hist.flatMap((h) => playerIds.map((pid) => Number(h.scores?.[pid] ?? 0)));
                    const minY = Math.min(0, ...allScores);
                    const maxY = Math.max(1, ...allScores);

                    const W = 460, H = 160, pad = 18;
                    const sx = (t) => pad + ((t - minT) / Math.max(1, (maxT - minT))) * (W - pad * 2);
                    const sy = (v) => (H - pad) - ((v - minY) / Math.max(1, (maxY - minY))) * (H - pad * 2);

                    const pathFor = (pid) => {
                      const pts = hist.map((h) => ({ x: sx(Number(h.turn || 0)), y: sy(Number(h.scores?.[pid] ?? 0)) }));
                      return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                    };

                    return (
                      <div className="mt-4">
                        <div className="text-amber-200/60 text-[10px] uppercase tracking-[0.3em] font-black">Progress (turn → VP)</div>
                        <svg width={W} height={H} className="mt-2 rounded-xl bg-black/25 border border-amber-900/20">
                          {/* axes */}
                          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="rgba(251,191,36,0.25)" />
                          <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="rgba(251,191,36,0.25)" />
                          {playerIds.map((pid, i) => (
                            <path key={pid} d={pathFor(pid)} fill="none" stroke={colors[i % colors.length]} strokeWidth={2.5} opacity={0.95} />
                          ))}
                        </svg>
                      </div>
                    );
                  })()}
                </>
              );
            })()}

            {/* fallback if no history */}
            {(!Array.isArray(G.history) || G.history.length < 2) && (
              <div className="mt-4 text-amber-100/80 text-sm font-mono whitespace-pre">
                {(G.players || []).map((p) => {
                  const pts = (p.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0);
                  return `${p.name}: ${pts} vp (coalition ${(p.coalition || []).length})`;
                }).join('\n')}
              </div>
            )}

            <div className="mt-4 text-amber-200/60 text-xs">(Refresh to start a new match for now.)</div>
          </div>
        </div>
      )}

      {/* Event splash (auto-hide) */}
      {ENABLE_SPLASH && showEventSplash && !!G.lastEvent && (
        <div className="fixed inset-0 z-[2500] pointer-events-none">
          <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 flex items-end gap-6">
            <div className="w-56 aspect-[2/3] rounded-3xl overflow-hidden border border-black/50 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
              <img src={G.lastEvent.img} alt={G.lastEvent.id} className="w-full h-full object-cover" draggable={false} />
            </div>
            <div className="max-w-[360px]">
              <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Event</div>
              <div className="mt-2 text-amber-100 font-serif text-xl font-bold">{G.lastEvent.id}</div>
              <div className="mt-2 text-amber-100/70 text-sm">Event effects not implemented yet.</div>
            </div>
          </div>
        </div>
      )}

      {/* Action splash (auto-hide) */}
      {ENABLE_SPLASH && showActionSplash && !!G.lastAction && (
        <div className="fixed inset-0 z-[2600] pointer-events-none">
          <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 flex items-end gap-6">
            <div className="w-56 aspect-[2/3] rounded-3xl overflow-hidden border border-black/50 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
              <img src={G.lastAction.img} alt={G.lastAction.id} className="w-full h-full object-cover" draggable={false} />
            </div>
            <div className="max-w-[360px]">
              <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action</div>
              <div className="mt-2 text-amber-100 font-serif text-xl font-bold">{G.lastAction.id}</div>
              <div className="mt-2 text-amber-100/70 text-sm">(MVP) Actions discard on play; effects later.</div>
            </div>
          </div>
        </div>
      )}

      {/* Log (collapsible) */}
      <div className={
        "fixed top-1/2 -translate-y-1/2 left-4 z-[950] pointer-events-auto transition-transform duration-300 ease-out " +
        (logCollapsed ? "translate-x-[-392px]" : "translate-x-0")
      }>
        <div className="w-[420px] bg-black/55 backdrop-blur-md border border-amber-900/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-900/10">
            <div className="text-[10px] uppercase tracking-widest text-amber-200/70 font-black">Chronicles</div>

            <div className="ml-auto flex items-center gap-2">
              {!logCollapsed && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowTutorial((v) => !v)}
                    className={("px-2 py-0.5 rounded-md border text-[10px] font-black transition-colors " + (showTutorial ? "bg-emerald-600/30 border-emerald-500/40 text-emerald-100" : "bg-black/20 border-amber-900/20 text-amber-200/70 hover:text-amber-200"))}
                    title="Tutorial (T)"
                  >
                    T
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHotkeys((v) => !v)}
                    className={("px-2 py-0.5 rounded-md border text-[10px] font-black transition-colors " + (showHotkeys ? "bg-emerald-600/30 border-emerald-500/40 text-emerald-100" : "bg-black/20 border-amber-900/20 text-amber-200/70 hover:text-amber-200"))}
                    title="Hotkeys (H)"
                  >
                    H
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setLogCollapsed((v) => !v)}
                className="px-2 py-0.5 rounded-md border border-amber-900/20 bg-black/20 text-amber-200/70 hover:text-amber-200 text-[12px] font-black"
                title="Toggle log (L)"
              >
                {logCollapsed ? ">" : "<"}
              </button>
            </div>
          </div>
          <div ref={logRef} className="px-3 py-3 font-mono text-[12px] whitespace-pre-wrap text-amber-100/80 max-h-[168px] overflow-y-auto custom-scrollbar">
            {(G.log || []).slice(-40).join("\n")}
          </div>
        </div>
      </div>

      {/* My coalition (built row fan) */}
      <div className={"fixed bottom-6 left-1/2 -translate-x-1/2 z-[5000] pointer-events-auto transition-all " + (G.gameOver ? "opacity-0 pointer-events-none blur-sm" : "opacity-100")}
        style={{ transform: 'translateX(calc(-50% - 300px))' }}>

        {(() => {
          const coal = (me?.coalition || []);
          const n = Math.max(1, coal.length);
          const step = Math.min(44, Math.max(18, 240 / Math.max(1, n - 1)));
          const width = 160 + (n - 1) * step;

          const scaleByDist3 = (dist) => {
            if (dist === 0) return 2.0;
            if (dist === 1) return 1.35;
            if (dist === 2) return 1.15;
            return 1;
          };

          return (
            <div
              className="relative h-64 overflow-visible"
              style={{ width }}
              onMouseMove={(e) => {
                if (!coal.length) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const idx = Math.max(0, Math.min(coal.length - 1, Math.round(x / step)));
                setHoverMyCoalition(idx);
              }}
              onMouseLeave={() => setHoverMyCoalition(null)}
            >
              {coal.map((c, i) => {
                const t = n <= 1 ? 0.5 : i / (n - 1);
                const rot = (t - 0.5) * 12;
                const left = i * step;

                const dist = hoverMyCoalition == null ? 99 : Math.abs(i - hoverMyCoalition);
                const scale = hoverMyCoalition == null ? 1 : scaleByDist3(dist);
                const z = hoverMyCoalition == null ? i : (1000 - dist);

                return (
                  <div
                    key={c.id}
                    className="absolute bottom-0 w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl"
                    style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: 'bottom center' }}
                    title={c.id}
                  >
                    <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                    {(Number(c.vpDelta || 0) < 0) && (
                      <div className="absolute left-2 bottom-2 w-8 h-8 rounded-full bg-red-700/90 border border-red-200/30 flex items-center justify-center text-white font-black text-[14px]">{c.vpDelta}</div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Hand fan */}
      <div className="fixed bottom-6 right-[310px] z-[999] pointer-events-auto">
        <div
          className="relative h-56 overflow-visible"
          style={{ width: `${handWidth}px`, marginLeft: 'auto' }}
          onMouseMove={(e) => {
            if (!cards.length) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const idx = Math.max(0, Math.min(cards.length - 1, Math.round(x / handStep)));
            setHoverHandIndex(idx);
          }}
          onMouseLeave={() => setHoverHandIndex(null)}
        >
          {cards.map((card, idx) => {
            const t = fanN <= 1 ? 0.5 : idx / (fanN - 1);
            const rot = (t - 0.5) * 18;
            const left = idx * handStep;

            const dist = hoverHandIndex == null ? 99 : Math.abs(idx - hoverHandIndex);
            const scale = hoverHandIndex == null ? 1 : scaleByDist(dist);
            const z = hoverHandIndex == null ? idx : (1000 - dist);

            const baseId = String(card.id).split('#')[0];

            const canPlayPersona = isMyTurn && !responseActive && G.hasDrawn && !G.hasPlayed && card.type === 'persona';
            const canPlayAction = isMyTurn && !responseActive && G.hasDrawn && !G.hasPlayed && card.type === 'action';

            // out-of-turn cancels
            const canCancelAction = responseActive && responseKind === 'cancel_action' && card.type === 'action' && baseId === 'action_6' && String(response.playedBy) !== String(playerID);
            const canCancelPersona = responseActive && responseKind === 'cancel_persona' && card.type === 'action' && baseId === 'action_8' && String(response.playedBy) !== String(playerID);

            const canClick = canPlayPersona || canPlayAction || canCancelAction || canCancelPersona;

            return (
              <button
                key={card.id}
                onClick={() => {
                  if (!canClick) return;
                  if (canPlayPersona) moves.playPersona(card.id);
                  else if (canPlayAction) {
                    if (baseId === 'action_4') {
                      setPickTargetForAction4({ cardId: card.id });
                      return;
                    }
                    moves.playAction(card.id);
                  } else if (canCancelAction || canCancelPersona) {
                    moves.playAction(card.id);
                  }
                }}
                aria-disabled={!canClick}
                className={
                  'absolute bottom-0 w-36 aspect-[2/3] rounded-2xl overflow-hidden border-2 transition-all duration-200 ease-out shadow-xl ' +
                  (canClick ? ((canCancelAction || canCancelPersona) ? 'border-emerald-500/50 hover:border-emerald-300 cursor-pointer' : 'border-amber-700/40 hover:border-amber-400 cursor-pointer') : 'border-slate-900 cursor-not-allowed')
                }
                style={{
                  left: `${left}px`,
                  zIndex: z,
                  transform: `rotate(${rot}deg) scale(${scale})`,
                  transformOrigin: 'bottom center',
                }}
                title={card.id}
              >
                <img src={card.img} alt={card.id} className="w-full h-full object-cover" draggable={false} />
                {showHotkeys && (
                  <div className="absolute left-2 top-2 px-2 py-1 rounded-full bg-black/65 border border-amber-900/30 text-amber-100 font-mono font-black text-[11px]">
                    ({idx + 1})
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tiny debug */}
      <div className="fixed bottom-4 left-4 z-[900] pointer-events-none select-none">
        <div className="bg-black/45 border border-amber-900/20 rounded-xl px-3 py-2 text-[10px] font-mono text-amber-200/70 whitespace-pre">
          hand: P{grouped.persona.length} A{grouped.action.length} E{grouped.event.length}{"\n"}
          turn: {String(ctx.currentPlayer) === String(playerID) ? 'YOU' : String(ctx.currentPlayer)}  drawn:{String(!!G.hasDrawn)}  played:{String(!!G.hasPlayed)}  event:{String(!!G.lastEvent)}
        </div>
      </div>
    </div>
  );
}


const GameClient = Client({
  game: PolitikumGame,
  multiplayer: SocketIO({ server: SERVER }),
  board: Board,
  debug: false,
});

function PolitikumWelcome({ onJoin }) {
  const [matches, setMatches] = useState([]);
  const [playerName, setPlayerName] = useState(() => {
    const base = NAMES[Math.floor(Math.random() * NAMES.length)];
    return `[H] ${base}`;
  });
  const [loading, setLoading] = useState(false);

  const refreshMatches = async () => {
    const { matches: fetchedMatches } = await lobbyClient.listMatches('politikum');
    setMatches(fetchedMatches || []);
  };

  useEffect(() => {
    refreshMatches().catch(() => {});
    const interval = setInterval(() => refreshMatches().catch(() => {}), 4000);
    return () => clearInterval(interval);
  }, []);

  const createMatch = async () => {
    if (!playerName) return alert('Enter your name first!');
    setLoading(true);
    try {
      const { matchID } = await lobbyClient.createMatch('politikum', {
        numPlayers: 3,
        setupData: { hostName: playerName },
      });
      setTimeout(() => joinMatch(matchID), 250);
    } catch (e) {
      alert('createMatch failed: ' + (e?.message || String(e)));
      setLoading(false);
    }
  };

  const joinMatch = async (matchID) => {
    if (!playerName) return alert('Enter your name first!');
    setLoading(true);
    try {
      const response = await lobbyClient.getMatch('politikum', matchID);
      const match = response.match || response;
      if (!match || !match.players) throw new Error('Match not found');

      // seat selection: first empty seat
      const freeSeat = match.players.find((p) => !p.name && !p.isConnected);
      if (!freeSeat) {
        alert('Match is full!');
        setLoading(false);
        return;
      }

      const { playerCredentials } = await lobbyClient.joinMatch('politikum', matchID, {
        playerID: String(freeSeat.id),
        playerName,
      });

      window.localStorage.setItem('politikum.playerName', playerName);
      onJoin({ matchID, playerID: String(freeSeat.id), credentials: playerCredentials });
      setLoading(false);
    } catch (e) {
      alert('Join failed: ' + (e?.message || String(e)));
      setLoading(false);
    }
  };

  // “prelobby / hosted / gamescreen” — first two screens are a straight copy of Citadel layout.
  return (
    <div
      className="h-screen w-screen text-slate-100 font-sans bg-cover bg-center bg-fixed bg-no-repeat overflow-hidden flex flex-row"
      style={{ backgroundImage: "url('/assets/lobby_bg.jpg')" }}
    >
      <div className="bg-transparent p-8 flex items-center justify-center w-full">
        <div className="flex gap-8 items-start max-w-5xl w-full mx-auto px-4 max-h-[85vh]">
          <div className="w-80 sm:w-96 flex flex-col h-fit">
            <div className="bg-black/75 backdrop-blur-xl p-8 rounded-3xl border border-amber-900/40 shadow-2xl flex flex-col h-fit max-w-md mx-auto">
              <h2 className="text-xl font-serif text-amber-500 font-bold mb-6 text-center uppercase tracking-widest border-b border-amber-500/20 pb-2">The Guest List</h2>
              <div className="p-3 mb-6 bg-amber-950/30 rounded-xl border border-amber-500/20 flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-widest text-amber-700 font-black px-1">Your Alias</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="bg-black/40 border border-amber-900/30 rounded-lg px-3 py-2 text-amber-200 font-serif text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="overflow-y-auto space-y-2 max-h-64 mb-6 pr-1 custom-scrollbar">
                <h3 className="text-[10px] uppercase tracking-widest text-amber-900/60 mb-2 border-b border-amber-900/10 pb-1">Available Realms</h3>
                {(matches || [])
                  .filter((match) => {
                    // Hide started matches: if no open seats, it’s in-progress.
                    if (match.gameover) return false;
                    const seats = match.players || [];
                    return seats.some((p) => p && p.name == null);
                  })
                  .map((match) => {
                    const host = match.setupData?.hostName || 'Noble';
                    const displayName = host.endsWith('s') ? `${host}' Realm` : `${host}'s Realm`;
                    return (
                      <div key={match.matchID} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-xl border border-amber-900/20 hover:bg-slate-900/80 transition-colors">
                        <div className="flex flex-col">
                          <span className="font-serif text-amber-100 text-sm font-bold">{displayName}</span>
                          <span className="text-[8px] text-amber-900/60 font-mono">ID: {match.matchID.slice(0, 4)}</span>
                        </div>
                        <button onClick={() => joinMatch(match.matchID)} className="text-amber-600 hover:text-amber-400 font-black text-xs uppercase">
                          [Join]
                        </button>
                      </div>
                    );
                  })}
                {(!matches || matches.length === 0) && <div className="text-center py-8 text-amber-900/40 italic text-sm font-serif">Awaiting realms...</div>}
              </div>

              <button onClick={createMatch} disabled={loading} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-amber-950 font-black rounded-xl uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-60">
                Host New Realm
              </button>
            </div>
          </div>

          <div className="flex-1">
            <div className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl">
              <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
              <div className="text-amber-100/70 font-serif mt-2">MVP: action phase + dealt hands + hand grouped. (Actions/reactions/events next.)</div>
              <div className="mt-4 text-amber-200/60 text-xs font-mono">Server: {SERVER}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SpineUI() {
  const [matchID, setMatchID] = useState(null);
  const [playerID, setPlayerID] = useState(null);
  const [credentials, setCredentials] = useState(null);

  if (!matchID) {
    return (
      <PolitikumWelcome
        onJoin={({ matchID: mid, playerID: pid, credentials: cred }) => {
          setMatchID(mid);
          setPlayerID(pid);
          setCredentials(cred);
        }}
      />
    );
  }

  return <GameClient matchID={matchID} playerID={playerID} credentials={credentials} />;
}
