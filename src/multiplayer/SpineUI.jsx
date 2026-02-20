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
  const me = (G.players || []).find((p) => String(p.id) === String(playerID));
  const isMyTurn = String(ctx.currentPlayer) === String(playerID);

  const groupedHand = useMemo(() => {
    const hand = me?.hand || [];
    const personas = hand.filter((c) => c.type === 'persona');
    const actions = hand.filter((c) => c.type === 'action');
    const events = hand.filter((c) => c.type === 'event');
    return { personas, actions, events };
  }, [me]);

  return (
    <div className="w-full min-h-screen bg-[url('/assets/ui/table.webp')] bg-cover bg-center text-amber-100">
      <div className="fixed top-3 left-3 z-[2000] pointer-events-none select-none">
        <div className="bg-black/60 border border-amber-900/20 rounded-lg px-2 py-1 text-[10px] font-mono font-black tracking-widest text-amber-200/80">
          {typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'nogit'}@{typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit'}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber-200/60">Politikum</div>
            <div className="font-black tracking-widest">Action phase</div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => moves.drawCard()}
              disabled={!isMyTurn || G.hasDrawn}
              className="px-4 py-2 rounded-xl bg-amber-900/40 border border-amber-500/20 disabled:opacity-40"
            >
              Draw
            </button>
            <button
              onClick={() => moves.endTurn()}
              disabled={!isMyTurn}
              className="px-4 py-2 rounded-xl bg-black/40 border border-amber-500/20 disabled:opacity-40"
            >
              End Turn
            </button>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60 mb-2">My Coalition</div>
          <div className="flex flex-wrap gap-3">
            {(me?.coalition || []).map((c) => (
              <Card key={c.id} card={c} disabled />
            ))}
            {(!me?.coalition || me.coalition.length === 0) && <div className="text-amber-200/40 italic">(empty)</div>}
          </div>
        </div>

        <div className="mt-10">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60 mb-2">Hand (grouped)</div>

          <div className="space-y-6">
            <div>
              <div className="text-amber-200/70 font-black tracking-widest text-xs mb-2">PERSONAS</div>
              <div className="flex flex-wrap gap-3">
                {groupedHand.personas.map((c) => (
                  <Card key={c.id} card={c} disabled={!isMyTurn || G.hasPlayed} onClick={() => moves.playPersona(c.id)} />
                ))}
              </div>
            </div>

            <div>
              <div className="text-amber-200/70 font-black tracking-widest text-xs mb-2">ACTIONS (MVP: later)</div>
              <div className="flex flex-wrap gap-3">
                {groupedHand.actions.map((c) => (
                  <Card key={c.id} card={c} disabled />
                ))}
                {groupedHand.actions.length === 0 && <div className="text-amber-200/30 italic">(coming)</div>}
              </div>
            </div>

            <div>
              <div className="text-amber-200/70 font-black tracking-widest text-xs mb-2">EVENTS (never stay in hand)</div>
              <div className="flex flex-wrap gap-3">
                {groupedHand.events.map((c) => (
                  <Card key={c.id} card={c} disabled />
                ))}
                {groupedHand.events.length === 0 && <div className="text-amber-200/30 italic">(none)</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 bg-black/50 border border-amber-900/20 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60 mb-2">Log</div>
          <div className="font-mono text-[12px] whitespace-pre-wrap text-amber-100/80 max-h-48 overflow-y-auto">
            {(G.log || []).slice(-30).join('\n')}
          </div>
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
