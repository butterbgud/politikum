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
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const me = (G.players || []).find((p) => String(p.id) === String(playerID));
  const isMyTurn = String(ctx.currentPlayer) === String(playerID) && !G.gameOver;
  const canAckEvent = !!G.pendingEvent;

  const [logCollapsed, setLogCollapsed] = useState(false);
  const [hoverHandIndex, setHoverHandIndex] = useState(null);
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
        if (!isMyTurn || G.hasDrawn || G.pendingEvent) return;
        moves.drawCard();
        return;
      }
      if (key === 'e') {
        if (!isMyTurn || !G.hasDrawn || !G.hasPlayed || G.pendingEvent) return;
        moves.endTurn();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMyTurn, G.hasDrawn, G.hasPlayed, G.pendingEvent, moves]);

  return (
    <div className="w-full min-h-screen bg-[url('/assets/ui/table.webp')] bg-cover bg-center text-amber-100">
      <div className="fixed top-3 left-3 z-[2000] pointer-events-none select-none">
        <div className="bg-black/60 border border-amber-900/20 rounded-lg px-2 py-1 text-[10px] font-mono font-black tracking-widest text-amber-200/80">
          {typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'nogit'}@{typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit'}
        </div>
      </div>

      {/* Opponents */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[900] flex gap-10 pointer-events-none">
        {opponents.map((p) => {
          const hand0 = p.hand || [];
          const cAll = (hand0 || []).length;

          const pts = (p.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0); // MVP points

          const handFan = (n, label) => {
            const show = Math.min(8, n);
            const step = 18;
            const width = 56 + Math.max(0, show - 1) * step;
            return (
              <div className="relative" style={{ width, height: 84 }} title={label}>
                {Array.from({ length: show }, (_, i) => {
                  const t = show <= 1 ? 0.5 : i / (show - 1);
                  const rot = (t - 0.5) * 14;
                  const left = i * step;
                  return (
                    <div
                      key={i}
                      className="absolute bottom-0 w-28 aspect-[2/3] rounded-xl overflow-hidden border border-black/40 shadow-2xl"
                      style={{ left, transform: `rotate(${rot}deg)`, transformOrigin: 'bottom center' }}
                    >
                      <img src="/assets/backing.jpg" className="w-full h-full object-cover" alt="back" draggable={false} />
                    </div>
                  );
                })}
                {n > 0 && (
                  <div className="absolute -top-2 -right-2 bg-black/70 border border-black/40 text-amber-100 font-mono font-black text-[12px] px-2 py-0.5 rounded-full">{n}</div>
                )}
              </div>
            );
          };

          const coal = (p.coalition || []);
          const n = Math.max(1, coal.length);
          const step = Math.min(54, Math.max(26, 280 / Math.max(1, n - 1)));
          const width = 120 + (n - 1) * step;
          const hoverIdx = hoverOppCoalition?.[p.id] ?? null;

          const scaleByDist2 = (dist) => {
            if (dist === 0) return 1.9;
            if (dist === 1) return 1.25;
            if (dist === 2) return 1.1;
            return 1;
          };

          return (
            <div key={p.id} className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 bg-black/55 border border-amber-900/20 rounded-full px-3 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90">
                <span>{p.name}</span>
                <span className="text-amber-200/50">•</span>
                <span className="text-amber-200/80">{pts}p</span>
              </div>

              {/* facedown hand fan (all unplayed cards) */}
              <div className="pointer-events-auto">
                {handFan(cAll, 'Hand')}
              </div>

              {/* coalition fan */}
              <div
                className="relative h-44"
                style={{ width: Math.max(width, 260), pointerEvents: 'auto' }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const idx = Math.max(0, Math.min(coal.length - 1, Math.round(x / step)));
                  setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: idx }));
                }}
                onMouseLeave={() => setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: null }))}
              >
                {coal.map((c, i) => {
                  const t = n <= 1 ? 0.5 : i / (n - 1);
                  const rot = (t - 0.5) * 10;
                  const left = i * step;
                  const dist = (hoverIdx == null) ? 99 : Math.abs(i - hoverIdx);
                  const scale = (hoverIdx == null) ? 1 : scaleByDist2(dist);
                  const z = (hoverIdx == null) ? i : (1000 - dist);

                  return (
                    <div
                      key={c.id}
                      className="absolute bottom-0 w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl"
                      style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: 'bottom center' }}
                      title={c.id}
                    >
                      <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
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
          onClick={() => { if (!isMyTurn || G.hasDrawn || G.pendingEvent) return; moves.drawCard(); }}
          className={
            "fixed pointer-events-auto select-none outline-none transition-transform duration-150 ease-out hover:-translate-y-1 hover:scale-[1.02] active:translate-y-0 active:scale-[0.99] " +
            ((!isMyTurn || G.hasDrawn || G.pendingEvent) ? "opacity-60 cursor-not-allowed hover:translate-y-0 hover:scale-100" : "cursor-pointer")
          }
          style={{ right: 'calc(2% + 148px)', bottom: 'calc(18% - 155px)', width: '172px' }}
          title={G.pendingEvent ? "Resolve event first" : (G.hasDrawn ? "Already drew" : "Draw card")}
          aria-disabled={!isMyTurn || G.hasDrawn || G.pendingEvent}
        >
          <div className="relative w-full h-auto">
            {(isMyTurn && !G.hasDrawn) && (
              <img src="/assets/ui/touch_deck_glow.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none animate-pulse" draggable={false} />
            )}
            <img src="/assets/ui/touch_deck.png" alt="Deck" className="w-full h-auto" draggable={false} />
          </div>
        </button>

        {/* Cookies (End Turn) */}
        <button
          type="button"
          onClick={() => { if (!isMyTurn || !G.hasDrawn || !G.hasPlayed || G.pendingEvent) return; moves.endTurn(); }}
          className={
            "fixed pointer-events-auto select-none outline-none transition-transform duration-150 ease-out hover:-translate-y-1 hover:scale-[1.02] active:translate-y-0 active:scale-[0.99] " +
            ((!isMyTurn || !G.hasDrawn || !G.hasPlayed || G.pendingEvent) ? "opacity-60 cursor-not-allowed hover:translate-y-0 hover:scale-100" : "cursor-pointer")
          }
          style={{ right: 'calc(2% - 12px)', top: 'calc(3% - 96px)', width: '280px' }}
          title={G.pendingEvent ? "Resolve event first" : (!G.hasDrawn ? "Draw first" : (!G.hasPlayed ? "Play first" : "End turn"))}
          aria-disabled={!isMyTurn || !G.hasDrawn || !G.hasPlayed || G.pendingEvent}
        >
          <img src="/assets/ui/touch_cookies.png" alt="End Turn" className="w-full h-auto" draggable={false} />
        </button>
      </div>

      {/* Hotkeys / Tutorial overlay */}
      {(showHotkeys || showTutorial) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/65 backdrop-blur-sm pointer-events-auto" onClick={() => { setShowHotkeys(false); setShowTutorial(false); }}>
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-6 w-[560px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center">
              <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">{showTutorial ? 'Tutorial' : 'Hotkeys'}</div>
              <button className="ml-auto text-amber-200/60 hover:text-amber-200 font-black" onClick={() => { setShowHotkeys(false); setShowTutorial(false); }}>x</button>
            </div>

            {showHotkeys && (
              <div className="mt-4 font-mono text-sm text-amber-100/80 whitespace-pre">
                L  toggle logs\n
                C  draw card\n
                E  end turn\n
                H  hotkeys\n
                T  tutorial
              </div>
            )}

            {showTutorial && (
              <div className="mt-4 text-amber-100/80 text-sm">
                <div className="font-black uppercase tracking-widest text-[11px] text-amber-200/70">Turn</div>
                <div className="mt-1">1) Draw (C)</div>
                <div>2) Play 1 persona (click card)</div>
                <div>3) End turn (E)</div>
                <div className="mt-3 text-amber-200/60 text-xs">Events will pause the turn until you click OK.</div>
              </div>
            )}
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
            <div className="mt-4 text-amber-100/80 text-sm font-mono whitespace-pre">
              {(G.players || []).map((p) => {
                const pts = (p.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0);
                return `${p.name}: ${pts} vp (coalition ${(p.coalition || []).length})`;
              }).join('\n')}
            </div>
            <div className="mt-4 text-amber-200/60 text-xs">(Refresh to start a new match for now.)</div>
          </div>
        </div>
      )}

      {/* Event prompt */}
      {!!G.pendingEvent && (
        <div className="fixed inset-0 z-[2500] pointer-events-none">
          {/* event card appears on table (no dark modal) */}
          <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 flex items-end gap-6 pointer-events-auto">
            <div className="w-56 aspect-[2/3] rounded-3xl overflow-hidden border border-black/50 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
              <img src={G.pendingEvent.img} alt={G.pendingEvent.id} className="w-full h-full object-cover" draggable={false} />
            </div>
            <div className="max-w-[360px]">
              <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Event</div>
              <div className="mt-2 text-amber-100 font-serif text-xl font-bold">{G.pendingEvent.id}</div>
              <div className="mt-2 text-amber-100/70 text-sm">
                Event effects not implemented yet.
              </div>
              <button
                type="button"
                onClick={() => { if (!canAckEvent) return; moves.acknowledgeEvent(); }}
                className="mt-3 text-amber-300 hover:text-amber-200 font-black uppercase tracking-widest text-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log (collapsible) */}
      <div className={
        "fixed top-1/2 -translate-y-1/2 left-4 z-[950] pointer-events-auto transition-transform duration-300 ease-out " +
        (logCollapsed ? "translate-x-[-360px]" : "translate-x-0")
      }>
        <div className="w-[340px] bg-black/55 backdrop-blur-md border border-amber-900/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-900/10">
            <div className="text-[10px] uppercase tracking-widest text-amber-200/70 font-black">Chronicles</div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTutorial((v) => !v)}
                className="text-amber-200/60 hover:text-amber-200 text-[10px] font-black"
                title="Tutorial (T)"
              >
                T
              </button>
              <button
                type="button"
                onClick={() => setShowHotkeys((v) => !v)}
                className="text-amber-200/60 hover:text-amber-200 text-[10px] font-black"
                title="Hotkeys (H)"
              >
                H
              </button>
              <button
                type="button"
                onClick={() => setLogCollapsed((v) => !v)}
                className="text-amber-200/60 hover:text-amber-200 text-[12px] font-black"
                title="Toggle log (L)"
              >
                {logCollapsed ? ">" : "<"}
              </button>
            </div>
          </div>
          <div className="px-3 py-3 font-mono text-[12px] whitespace-pre-wrap text-amber-100/80 max-h-[420px] overflow-y-auto">
            {(G.log || []).slice(-40).join("\n")}
          </div>
        </div>
      </div>

      {/* My coalition (built row fan) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[800] pointer-events-auto" style={{ transform: 'translateX(calc(-50% - 300px))' }}>
        {(() => {
          const coal = (me?.coalition || []);
          const n = Math.max(1, coal.length);
          const step = Math.min(78, Math.max(34, 420 / Math.max(1, n - 1)));
          const width = 160 + (n - 1) * step;
          return (
            <div className="relative h-64" style={{ width }}>
              {coal.map((c, i) => {
                const t = n <= 1 ? 0.5 : i / (n - 1);
                const rot = (t - 0.5) * 12;
                const left = i * step;
                return (
                  <div
                    key={c.id}
                    className="absolute bottom-0 w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl"
                    style={{ left, transform: `rotate(${rot}deg)`, transformOrigin: 'bottom center' }}
                    title={c.id}
                  >
                    <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
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

            const canPlayPersona = isMyTurn && G.hasDrawn && !G.hasPlayed && !G.pendingEvent && card.type === 'persona';

            return (
              <button
                key={card.id}
                onClick={() => {
                  if (!canPlayPersona) return;
                  moves.playPersona(card.id);
                }}
                aria-disabled={!canPlayPersona}
                className={
                  'absolute bottom-0 w-36 aspect-[2/3] rounded-2xl overflow-hidden border-2 transition-all duration-200 ease-out shadow-xl ' +
                  (canPlayPersona ? 'border-amber-700/40 hover:border-amber-400 cursor-pointer' : 'border-slate-900 cursor-not-allowed')
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Tiny debug */}
      <div className="fixed bottom-4 left-4 z-[900] pointer-events-none select-none">
        <div className="bg-black/45 border border-amber-900/20 rounded-xl px-3 py-2 text-[10px] font-mono text-amber-200/70 whitespace-pre">
          hand: P{grouped.persona.length} A{grouped.action.length} E{grouped.event.length}{"\n"}
          turn: {String(ctx.currentPlayer) === String(playerID) ? 'YOU' : String(ctx.currentPlayer)}  drawn:{String(!!G.hasDrawn)}  played:{String(!!G.hasPlayed)}  event:{String(!!G.pendingEvent)}
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
