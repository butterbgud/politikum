import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient, Client as VanillaClient } from 'boardgame.io/client';
import React, { useEffect, useState, useRef } from 'react';

// SFX (ported from SP; no animations)
let SFX_ENABLED = true;
const sfxCacheRef = { current: {} };
const playSfx = (name, { volume = 0.75 } = {}) => {
  try {
    if (!SFX_ENABLED) return;
    if (!name) return;
    const cache = sfxCacheRef.current;
    const src = `/assets/sfx/${name}.ogg`;
    let a = cache[name];
    if (!a) {
      a = new Audio(src);
      a.preload = 'auto';
      cache[name] = a;
    }
    const inst = a.cloneNode(true);
    inst.volume = volume;
    inst.play?.().catch?.(() => {});
  } catch {}
};

import { CitadelGame, CitadelLobby } from './Game';
import royalDecreeText from '../royal-decree.txt?raw';

import { runBotTurn } from '../botLogic';

// --- DEV CHEATS (enable with ?dev=1) ---
const DEV = new URLSearchParams(window.location.search).get('dev') === '1';

function DevCheats({ moves }) {
  const search = window.location.search;
  return (
    <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 2147483647, background: 'rgba(0,0,0,0.92)', color: '#fff', padding: 16, borderRadius: 12, fontFamily: 'monospace', border: '3px solid #ff0', boxShadow: '0 0 0 6px rgba(0,0,0,0.55)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>DEV CHEATS</div>
      <div style={{ marginBottom: 8, opacity: 0.8 }}>DEV={String(DEV)} search={search}</div>
      {!DEV ? (
        <div style={{ opacity: 0.8 }}>Add <b>?dev=1</b> to enable cheats.</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => moves?.devSetGold?.(99)}>Gold 99</button>
          <button onClick={() => moves?.devGiveDistrict?.('Observatory')}>Give Observatory</button>
          <button onClick={() => moves?.devBuildFree?.('Observatory')}>Build Observatory</button>
          <button onClick={() => moves?.devGiveDistrict?.('Library')}>Give Library</button>
          <button onClick={() => moves?.devBuildFree?.('Library')}>Build Library</button>
          <button onClick={() => moves?.useSmithy?.()}>Use Smithy</button>
          <button onClick={() => moves?.labStart?.()}>Lab: choose discard</button>
        </div>
      )}
      <div style={{ marginTop: 6, opacity: 0.8 }}>Test: draw cards after building.</div>
    </div>
  );
}
// --- /DEV CHEATS ---

// Shared Components
import Board from "../components/Board";

const SERVER = `http://${window.location.hostname}:8000`;
const lobbyClient = new LobbyClient({ server: SERVER });

// UI asset map (engine should not be the source of truth for image paths)
const ROLE_IMG_BY_ID = {
  1: '/assets/characters/assassin.jpg',
  2: '/assets/characters/thief.jpg',
  3: '/assets/characters/magician.jpg',
  4: '/assets/characters/queen.jpg',
  5: '/assets/characters/bishop.jpg',
  6: '/assets/characters/merchant.jpg',
  7: '/assets/characters/architect.jpg',
  8: '/assets/characters/warlord.jpg',
};


export const MEDIEVAL_NAMES = [
  "Aethelred", "Baldwin", "Cedric", "Dunstan", "Eadric", "Florian", "Godfrey", "Hildegard",
  "Isolde", "Jocelyn", "Kenric", "Leofric", "Maldred", "Neville", "Osric", "Percival",
  "Quentin", "Rowena", "Sigismund", "Theobald", "Ulric", "Valerius", "Wilfred", "Xavier",
  "Yvaine", "Zephyr", "Alaric", "Beatrix", "Cuthbert", "Dervla", "Egbert", "Freya", "Gisela", 
  "Hadrian", "Ingrid", "Joram", "Katarina", "Lothair", "Millicent", "Nikolas", "Odilia", 
  "Piers", "Quenburga", "Roderick", "Sibylla", "Tristan", "Ursula", "Viggo", "Wulfric", 
  "Xene", "Yolanda", "Zoltan", "Anselm", "Bertha", "Caspar", "Doda", "Elric", "Faramund", 
  "Gertrud", "Hakon", "Ida", "Jerome", "Kirsten", "Lambert", "Maude", "Norbert", "Odo", 
  "Philibert", "Quintus", "Rixa", "Swithun", "Theodora", "Udo", "Vesta", "Walram", 
  "Ximen", "Yseult", "Zdislava", "Adalbero", "Brunhilda", "Clovis", "Dagmar", "Eustace", 
  "Fulk", "Guntram", "Hedwig", "Irmgard", "Judith", "Kunigunde", "Liutgard", "Mechtild", 
  "Notburga", "Ottokar", "Pippin", "Rosamund", "Siegfried", "Tassilo", "Uta", "Vandela", 
  "Wiborada", "Xenia", "Yrsa", "Zita", "Alcuin", "Balthasar", "Cyprian", "Dietrich", 
  "Emmeram", "Frideswide", "Gerold", "Hemma", "Irenaeus", "Justina", "Korbinian", 
  "Ludmilla", "Meinrad", "Nithard", "Oswine", "Pirmin", "Quiteria", "Remigius", "Salome", 
  "Tillo", "Ubaldo", "Verena", "Wunibald", "Xanthippe", "Yancy", "Zoticus"
];

// --- STAGE 1: WELCOME SCREEN ---
export const CitadelWelcome = ({ onJoin }) => {
  const [matches, setMatches] = useState([]);
  const [playerName, setPlayerName] = useState(() => {
     const base = MEDIEVAL_NAMES[Math.floor(Math.random() * MEDIEVAL_NAMES.length)];
     return `[H] ${base}`;
  });
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [dummyChat, setDummyChat] = useState([
    { sender: "System", text: "Welcome to the Tavern. Whisper your strategy..." },
  ]);
  const [chatClient, setChatClient] = useState(null);

  useEffect(() => {
    let client;
    const connectChat = async () => {
        try {
            const { matches } = await lobbyClient.listMatches('citadel-lobby');
            let matchID;
            let playerID;
            let credentials;

            if (matches.length > 0) {
                matchID = matches[0].matchID;
                const result = await lobbyClient.joinMatch('citadel-lobby', matchID, { playerName });
                playerID = String(result.playerID);
                credentials = result.playerCredentials;
            } else {
                const result = await lobbyClient.createMatch('citadel-lobby', { numPlayers: 100 });
                matchID = result.matchID;
                const joinRes = await lobbyClient.joinMatch('citadel-lobby', matchID, { playerName });
                playerID = String(joinRes.playerID);
                credentials = joinRes.playerCredentials;
            }

            if (matchID && playerID && credentials) {
                client = VanillaClient({
                    game: CitadelLobby,
                    multiplayer: SocketIO({ server: SERVER }),
                    matchID,
                    playerID,
                    credentials,
                });
                client.start();
                client.subscribe(state => {
                    if (state?.G?.chat) setDummyChat(state.G.chat);
                });
                setChatClient(client);
            }
        } catch (e) {
            console.error("Chat connect failed", e);
        }
    };
    if (!chatClient) connectChat();
    return () => { if (client) client.stop(); };
  }, []);

  const refreshMatches = async () => {
    try {
      const { matches: fetchedMatches } = await lobbyClient.listMatches('citadel');
      setMatches(fetchedMatches || []);
    } catch (e) {
      console.error("Failed to fetch matches", e);
    }
  };

  useEffect(() => {
    refreshMatches();
    const interval = setInterval(refreshMatches, 5000);
    return () => clearInterval(interval);
  }, []);

  const createMatch = async () => {
    if (!playerName) return alert("Enter your name first!");
    setLoading(true);
    try {
      console.log('[lobby] createMatch click', { server: SERVER, playerName });
      const { matchID } = await lobbyClient.createMatch('citadel', { 
        numPlayers: 4,
        setupData: { hostName: playerName } 
      });
      console.log('[lobby] created match', matchID);
      setTimeout(() => joinMatch(matchID), 250);
    } catch (e) {
      console.error('createMatch failed', e);
      alert('createMatch failed: ' + (e?.message || String(e)));
      setLoading(false);
    }
  };

  const joinMatch = async (matchID) => {
    if (!playerName) return alert("Enter your name first!");
    setLoading(true);
    try {
      const response = await lobbyClient.getMatch('citadel', matchID);
      const match = response.match || response;
      if (!match || !match.players) throw new Error("Match not found");
      
      // AUTO-EVICT BOTS: 
      // 1. Try a completely empty seat (no name AND not connected)
      // 2. If none, try a bot seat (name starts with [B])
      const freeSeat = match.players.find(p => !p.name && !p.isConnected) || 
                       match.players.find(p => p.name && p.name.startsWith('[B]'));
      
      if (!freeSeat) { alert("Match is full of humans!"); setLoading(false); return; }
      
      const { playerCredentials } = await lobbyClient.joinMatch('citadel', matchID, {
        playerID: String(freeSeat.id),
        playerName: playerName,
      });
      window.localStorage.setItem('citadel.playerName', playerName);
      onJoin({ matchID, playerID: String(freeSeat.id), credentials: playerCredentials, playerName });
      setLoading(false);
    } catch (e) {
      console.error('joinMatch failed', e);
      alert('Join failed: ' + (e?.message || String(e)));
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen text-slate-100 font-sans bg-cover bg-center bg-fixed bg-no-repeat overflow-hidden flex flex-row" style={{ backgroundImage: "url('/assets/ui/logo_olde_hansa.webp')" }}>
      <div className="bg-transparent p-8 flex items-center justify-center w-full">
        <div className="flex gap-8 items-start max-w-7xl w-full mx-auto px-4 max-h-[85vh]">
          
          {/* TAVERN BANTER (LOBBY CHAT PORTED FROM SP) */}
          <div className="flex-1 flex flex-col h-[600px] pointer-events-auto min-w-[600px]">
              <div className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl flex flex-col h-full">
                  <h3 className="text-xl font-black text-amber-600 uppercase tracking-[0.3em] mb-4 border-b border-amber-900/10 pb-3 flex items-center gap-2">
                      <span className="text-2xl">💬</span> Tavern Banter
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-4 custom-scrollbar text-lg font-serif">
                      {dummyChat.map((msg, i) => (
                          <div key={`chat-${i}`} className="leading-relaxed border-l-2 border-amber-900/40 pl-4">
                              <span className="text-amber-600 font-black mr-3 uppercase tracking-tighter text-xs opacity-80">{msg.sender}:</span>
                              <span className="text-amber-100">{msg.text}</span>
                          </div>
                      ))}
                  </div>
                  <form 
                      onSubmit={(e) => { 
                          e.preventDefault(); 
                          if (chatInput.trim()) { 
                              if (chatClient) {
                                  chatClient.moves.submitChat({ sender: playerName, text: chatInput });
                              } else {
                                  setDummyChat([...dummyChat, { sender: playerName, text: chatInput }]); 
                              }
                              setChatInput(""); 
                          } 
                      }} 
                      className="mt-4 flex gap-4 border-t border-amber-900/10 pt-4"
                  >
                      <input 
                          type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} 
                          placeholder="Whisper your strategy..." 
                          className="flex-1 bg-black/40 border border-amber-900/20 rounded-xl px-4 py-3 text-amber-100 focus:outline-none focus:border-amber-500 text-sm" 
                      />
                      <button type="submit" className="px-6 py-3 bg-amber-900/40 border border-amber-900/20 rounded-xl text-xs font-black text-amber-500 uppercase tracking-widest active:scale-95">Yap!</button>
                  </form>
              </div>
          </div>

          <div className="w-80 sm:w-96 flex flex-col h-fit">
              <div className="bg-black/75 backdrop-blur-xl p-8 rounded-3xl border border-amber-900/40 shadow-2xl flex flex-col h-fit max-w-md mx-auto">
                  <h2 className="text-xl font-serif text-amber-500 font-bold mb-6 text-center uppercase tracking-widest border-b border-amber-500/20 pb-2">The Guest List</h2>
                  <div className="p-3 mb-6 bg-amber-950/30 rounded-xl border border-amber-500/20 flex flex-col gap-2">
                      <label className="text-[10px] uppercase tracking-widest text-amber-700 font-black px-1">Your Alias</label>
                      <input 
                          type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)}
                          className="bg-black/40 border border-amber-900/30 rounded-lg px-3 py-2 text-amber-200 font-serif text-sm focus:outline-none focus:border-amber-500"
                      />
                  </div>
                  <div className="overflow-y-auto space-y-2 max-h-64 mb-6 pr-1 custom-scrollbar">
                      <h3 className="text-[10px] uppercase tracking-widest text-amber-900/60 mb-2 border-b border-amber-900/10 pb-1">Available Realms</h3>
                      {(matches || []).map(match => {
                          const host = match.setupData?.hostName || "Noble";
                          const displayName = host.endsWith('s') ? `${host}' Realm` : `${host}'s Realm`;
                          return (
                              <div key={match.matchID} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-xl border border-amber-900/20 hover:bg-slate-900/80 transition-colors">
                                  <div className="flex flex-col">
                                      <span className="font-serif text-amber-100 text-sm font-bold">{displayName}</span>
                                      <span className="text-[8px] text-amber-900/60 font-mono">ID: {match.matchID.slice(0, 4)}</span>
                                  </div>
                                  <button onClick={() => joinMatch(match.matchID)} className="text-amber-600 hover:text-amber-400 font-black text-xs uppercase">[Join]</button>
                              </div>
                          );
                      })}
                      {(!matches || matches.length === 0) && <div className="text-center py-8 text-amber-900/40 italic text-sm font-serif">Awaiting realms...</div>}
                  </div>
                  <button onClick={createMatch} disabled={loading} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-amber-950 font-black rounded-xl uppercase tracking-widest shadow-lg transition-all active:scale-95">
                      Host New Realm
                  </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- STAGE 2: MATCH UI ---
const MultiplayerSpineUI = ({ G, moves, playerID, ctx }) => {
  
  const logEndRef = useRef(null);
  const [hoverActionHandIndex, setHoverActionHandIndex] = useState(null);
  const [hoverActionCityIndex, setHoverActionCityIndex] = useState(null);
  const isInGame = ctx.phase !== 'lobby' && ctx.phase !== 'results';
  const [chatInput, setChatInput] = useState("");
  const decreePrintedRef = useRef(false);

  const me = G?.players?.[playerID];
  const isMyTurn = playerID === ctx.currentPlayer;
  const isHost = playerID === '0';
  const isBotTurn = !!G?.players?.[ctx.currentPlayer]?.isBot;
  const canHostDriveBot = isHost && isBotTurn && ctx.currentPlayer !== '0';

  const boardState = {
    ...G,
    phase: ctx.phase,
    currentPlayerId: ctx.currentPlayer,
    turn: ctx.turn,
    interaction: G?.players?.[ctx.currentPlayer]?.interaction, 
    toast: G?.toast,
    sfx: G?.sfx,
    playerName: G?.players?.[playerID]?.name
  };

  const [logCollapsed, setLogCollapsed] = useState(false);
  const [devCheatsOpen, setDevCheatsOpen] = useState(DEV);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const v = window.localStorage.getItem('citadel.soundEnabled');
    return v == null ? true : v === '1' || v === 'true';
  });

  const [tutorialEnabled, setTutorialEnabled] = useState(() => {
    const v = window.localStorage.getItem('citadel.tutorialEnabled');
    return v == null ? true : v === '1' || v === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem('citadel.tutorialEnabled', tutorialEnabled ? '1' : '0');
  }, [tutorialEnabled]);

  useEffect(() => {
    window.localStorage.setItem('citadel.soundEnabled', soundEnabled ? '1' : '0');
    SFX_ENABLED = !!soundEnabled;
  }, [soundEnabled]);

  const dispatch = (action) => {
    // PROXY: If Host (0) is running a bot turn, route via submitBotAction
    if (playerID === '0' && ctx.currentPlayer !== '0' && G?.players?.[ctx.currentPlayer]?.isBot) {
        // Exclude chat/name updates (Host actions)
        if (!['SUBMIT_CHAT', 'UPDATE_NAME'].includes(action.type)) {
            moves.submitBotAction(action.type, action.payload);
            return;
        }
    }

    const map = {
        'TAKE_GOLD': () => moves.takeGold(),
        'DRAW_CARDS_START': () => moves.drawCards(),
        'KEEP_CARD': (p) => moves.keepCard(p.cardId),
        'BUILD_DISTRICT': (p) => moves.buildDistrict(p.cardId),
        'END_TURN': () => moves.endTurn(),
        'PICK_ROLE': (p) => moves.pickRole(p.roleId),
        'RESOLVE_INTERACTION': (p) => moves.resolveInteraction(p),
        'ACTIVATE_ABILITY': () => moves.activateAbility(),
        'USE_SMITHY': () => moves.useSmithy(),
        'USE_LAB_START': () => moves.labStart(),
        'USE_LAB_DISCARD': (p) => moves.labDiscard(p.cardId),
        'SUBMIT_CHAT': (p) => moves.submitChat(p.text),
        'UPDATE_NAME': (p) => moves.updatePlayerName(p.name),
    };
    if (map[action.type]) map[action.type](action.payload);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [G?.log?.length, G?.chat?.length]);

  // Hotkeys (match desktop SP)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (isTyping) return;

      const k = (e.key || '').toLowerCase();

      if (k === 'escape') {
        if (boardState.interaction) {
          e.preventDefault();
          dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
        }
        return;
      }

      if (k === 'g' && ctx.phase === 'action') { e.preventDefault(); dispatch({ type: 'TAKE_GOLD' }); }
      if (k === 'c' && ctx.phase === 'action') { e.preventDefault(); dispatch({ type: 'DRAW_CARDS_START' }); }
      if (k === 'a' && ctx.phase === 'action') { e.preventDefault(); dispatch({ type: 'ACTIVATE_ABILITY' }); }
      if (k === 'e' && ctx.phase === 'action') { e.preventDefault(); dispatch({ type: 'END_TURN' }); }

      // Build hotkeys: 1..9 builds that card from your hand (if buildable)
      if (ctx.phase === 'action' && isMyTurn && !boardState.interaction && /^[1-9]$/.test(k)) {
        const idx = Number(k) - 1;
        const card = (me?.hand || [])[idx];
        if (card) {
          e.preventDefault();
          dispatch({ type: 'BUILD_DISTRICT', payload: { cardId: card.id } });
        }
      }

      if (k === 'l') { e.preventDefault(); setLogCollapsed((v) => !v); }
      if (k === 't') { e.preventDefault(); setTutorialEnabled((v) => !v); }
      if (k === 'm') { e.preventDefault(); setSoundEnabled((v) => !v); }
      if (k === '`') { e.preventDefault(); setDevCheatsOpen((v) => !v); }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ctx.phase, boardState.interaction, playerID, tutorialEnabled, soundEnabled, devCheatsOpen]);

  // Removed spammy decree auto-print

  useEffect(() => {
    const isBotName = me?.name?.startsWith('[B] ');
    const isGenericName = me?.name?.startsWith('Player ');

    if (me && (isBotName || isGenericName)) {
        const storedName = window.localStorage.getItem('citadel.playerName');
        if (storedName) moves.updatePlayerName(storedName);
    }
  }, [me?.id, me?.name]);

  useEffect(() => {
    const currentSeatId = ctx.currentPlayer;
    const currentSeat = G?.players?.[currentSeatId];
    if (!currentSeat) return;

    const params = new URLSearchParams(window.location.search);

    // Dev mode: force bots to just take gold + end turn (keeps game flowing)
    const BOTFAST = params.get('botfast') === '1';

    // In dev mode, don't auto-run bots unless explicitly enabled.
    const AUTOBOT = params.get('autobot') === '1';

    // Only Player 0 (host) drives bots.
    const iShouldAct = (playerID === '0' && currentSeat.isBot);

    if (!iShouldAct || ctx.phase === 'lobby' || ctx.phase === 'results') return;

    if (BOTFAST) {
      const t = setTimeout(() => {
        // simple bot policy: take gold (if possible) then end turn.
        dispatch({ type: 'TAKE_GOLD' });
        setTimeout(() => dispatch({ type: 'END_TURN' }), 50);
      }, 250);
      return () => clearTimeout(t);
    }

    if (!AUTOBOT) return;
    const t = setTimeout(() => { runBotTurn(boardState, dispatch); }, 1000);
    return () => clearTimeout(t);
  }, [G?.players, ctx.currentPlayer, ctx.phase, playerID]);

  const BG = (ctx.phase === 'lobby')
    ? '/assets/ui/logo_olde_hansa.webp'
    : '/assets/ui/table.webp';

  return (
    <div className={`h-screen w-screen text-slate-100 font-sans bg-cover bg-center bg-fixed bg-no-repeat overflow-hidden flex flex-col ${ctx.phase === 'lobby' ? 'justify-center' : ''}`} style={{ backgroundImage: `url(${BG})` }}>
      {devCheatsOpen && <DevCheats moves={moves} />}
      <div className={isInGame ? "bg-transparent flex-1 overflow-y-auto p-8 select-none" : "bg-transparent p-8 flex items-center justify-center h-full w-full"}>
        <div className="fixed top-2 left-2 z-[9999] text-[10px] font-mono font-black text-amber-200 bg-black/70 px-2 py-1 rounded border border-amber-900/30">
            {__GIT_BRANCH__}:{__GIT_SHA__} | PHASE={ctx.phase} PLAYER={playerID} ACTIVE={ctx.currentPlayer}
        </div>

        {ctx.phase === 'lobby' && (
          <div className="flex gap-8 items-start max-w-7xl w-full mx-auto px-4 mt-20">
              
              {/* TAVERN BANTER (2/3 WIDE) */}
              <div className="flex-1 flex flex-col h-[600px] pointer-events-auto">
                  <div className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl flex flex-col h-full">
                      <h3 className="text-xl font-black text-amber-600 uppercase tracking-[0.3em] mb-4 border-b border-amber-900/10 pb-3 flex items-center gap-2">
                          <span className="text-2xl">💬</span> Tavern Banter
                      </h3>
                      <div className="flex-1 overflow-y-auto space-y-2 pr-4 custom-scrollbar text-lg font-serif">
                          {G?.log?.map((entry, i) => (<div key={`log-${i}`} className="leading-relaxed border-l-2 border-slate-900 pl-4 text-slate-500 italic text-sm">{entry}</div>))}
                          {G?.chat?.map((msg, i) => (<div key={`chat-${i}`} className="leading-relaxed border-l-2 border-amber-900/40 pl-4"><span className="text-amber-600 font-black mr-3 uppercase tracking-tighter text-xs opacity-80">{msg.sender}:</span><span className="text-amber-100">{msg.text}</span></div>))}
                          <div ref={logEndRef} />
                      </div>
                      <form onSubmit={(e) => { e.preventDefault(); if (chatInput.trim()) { dispatch({ type: 'SUBMIT_CHAT', payload: { text: chatInput } }); setChatInput(""); } }} className="mt-4 flex gap-4 border-t border-amber-900/10 pt-4">
                          <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Whisper your strategy..." className="flex-1 bg-black/40 border border-amber-900/20 rounded-xl px-4 py-3 text-amber-100 focus:outline-none focus:border-amber-500" />
                          <button type="submit" className="px-6 py-3 bg-amber-900/40 border border-amber-900/20 rounded-xl text-xs font-black text-amber-500 uppercase tracking-widest active:scale-95">Yap!</button>
                      </form>
                  </div>
              </div>

              {/* THE WAR ROOM (1/3 NARROW) */}
              <div className="w-80 sm:w-96 flex flex-col h-fit">
                <div className="bg-black/85 backdrop-blur-2xl p-8 rounded-3xl border border-amber-900/40 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                    <h2 className="text-xl font-serif text-amber-500 font-bold mb-6 text-center uppercase tracking-widest border-b border-amber-500/20 pb-2">The War Room</h2>
                    <div className="mb-6 text-center">
                        <span className="text-3xl font-black text-amber-200 font-mono">
                            {G?.players?.filter(p => (p.name && !p.name.startsWith('Player ')) || p.isBot).length || 0}
                        </span>
                        <span className="text-amber-800 text-xl font-serif mx-2">/</span>
                        <span className="text-xl text-amber-800 font-serif">{G?.players?.length || 4} Seats</span>
                    </div>
                    <div className="space-y-2 mb-8 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                        {G?.players?.map((p, i) => {
                            const isGeneric = p.name?.startsWith('Player ');
                            const isConnected = p.isConnected;
                            const isClaimed = !isGeneric || p.isBot || isConnected;
                            
                            if (!isClaimed) return null;
                            return (
                                <div key={i} className="flex justify-between items-center bg-amber-950/20 p-3 rounded-xl border border-amber-900/20">
                                    <div className="flex items-center gap-3">
                                        <span className="font-serif text-amber-100 text-sm truncate w-40">{p.name} {p.isBot && <span className="text-[9px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded ml-1 font-sans">BOT</span>}</span>
                                    </div>
                                    {playerID === '0' && i !== 0 && <button onClick={() => moves.removePlayer(p.id)} className="text-red-900/60 hover:text-red-500 text-[9px] uppercase font-bold">[Dismiss]</button>}
                                </div>
                            );
                        })}
                    </div>
                    {playerID === '0' && (
                      <div className="flex flex-col gap-2 mt-4">
                          <button onClick={() => moves.addBot()} className="w-full h-16 transition-all active:scale-95 group">
                              <img src="/assets/ui/ab.png" alt="Add Bot" className="w-full h-full object-contain opacity-80 group-hover:opacity-100" />
                          </button>
                          <button onClick={() => moves.startGame()} className="w-full h-24 transition-all active:scale-95 group">
                              <img src="/assets/ui/begin.png" alt="Begin Game" className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(251,191,36,0.3)] group-hover:drop-shadow-[0_0_30px_rgba(251,191,36,0.5)]" />
                          </button>
                      </div>
                    )}
                </div>
              </div>

          </div>
        )}

        {isInGame && (
          <div className="w-full relative h-full">
            <Board state={boardState} viewerId={playerID} dispatch={dispatch} />
            {ctx.phase === 'draft' && (
              <div className="fixed inset-0 z-[500] bg-transparent flex flex-col items-center justify-center p-8">
                {/* Tutorial: draft hint */}
                {tutorialEnabled && isMyTurn && (
                  <div className="fixed z-[650] pointer-events-none left-1/2 -translate-x-1/2 bottom-[260px]">
                    <div className="bg-black/75 text-amber-100 border border-amber-700/40 shadow-[0_0_30px_rgba(251,191,36,0.18)] rounded-xl px-4 py-2 text-[12px] font-serif max-w-[280px] text-center">
                      Pick a <b>character</b> card to start the round.
                    </div>
                  </div>
                )}
                {/* Draft: removed roles stack (rejects) */}
                <div className="hidden lg:block fixed right-4 top-1/2 -translate-y-1/2 z-[600] pointer-events-none">
                  <div className="relative w-36" style={{ height: '520px' }}>
                    {/* facedown bottom layer */}
                    {G?.removedFaceDownRole && (
                      <div className="absolute left-0 bottom-0 w-36 aspect-[2/3] rounded-xl overflow-hidden border border-black/40 shadow-2xl opacity-90" style={{ zIndex: 10 }}>
                        <img src="/assets/ui/character_back.jpg" alt="Removed facedown" className="w-full h-full object-cover" />
                      </div>
                    )}

                    {/* face-up rejects stacked upward */}
                    {(G?.removedFaceUpRoles || []).slice().reverse().map((r, idx) => (
                      <div
                        key={r.id}
                        className="absolute left-0 w-36 aspect-[2/3] rounded-xl overflow-hidden border border-black/40 shadow-2xl"
                        style={{ bottom: `${(idx + 1) * 50}px`, opacity: 0.95, zIndex: 20 + idx }}
                      >
                        <img src={ROLE_IMG_BY_ID[r.id] || r.img} alt={r.name} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>

                <h2 className="text-4xl text-amber-500 font-serif font-black uppercase tracking-[0.2em] mb-12">Role Draft</h2>
                {isMyTurn ? (
                  <div className="flex gap-4 justify-center items-end -space-x-12">
                    {(G?.availableRoles || []).map(role => (
                      <button key={role.id} onClick={() => dispatch({ type: 'PICK_ROLE', payload: { roleId: role.id } })} className="p-0 rounded-xl transition-all group flex flex-col items-center gap-2 overflow-visible w-36 pt-3 hover:-translate-y-6 hover:z-10"><div className="w-full aspect-[2/3] rounded-lg overflow-hidden border-2 border-amber-900/30 shadow-2xl transition-transform hover:border-amber-400"><img src={ROLE_IMG_BY_ID[role.id] || role.img} alt={role.name} className="w-full h-full object-cover" /></div></button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center space-y-4"><div className="w-16 h-16 border-4 border-amber-900/20 border-t-amber-500 rounded-full animate-spin mx-auto"></div><p className="text-xl text-amber-100/60 font-serif italic">Awaiting Player {ctx.currentPlayer}...</p></div>
                )}
              </div>
            )}
            {ctx.phase === 'action' && tutorialEnabled && isMyTurn && !boardState.interaction && (!me?.hasTakenAction) && (
              <div className="fixed bottom-[290px] left-6 z-[1200] pointer-events-none select-none">
                <div className="bg-black/70 backdrop-blur-md rounded-xl border border-amber-900/30 px-3 py-2 shadow-2xl text-amber-100 font-serif text-[12px]">
                  Tip: press <b>G</b> for gold or <b>C</b> to draw cards.
                </div>
              </div>
            )}

            {ctx.phase === 'action' && (isMyTurn || canHostDriveBot) && !boardState.interaction && (
              <div className="fixed bottom-6 left-6 z-[1000] pointer-events-auto select-none">
                <div className="relative w-56 h-56">
                  <img src="/assets/ui/touch_actions.png" alt="Actions" className="absolute inset-0 w-full h-full object-contain opacity-95" />
                  <button onClick={() => { playSfx('coin', { volume: 0.75 }); dispatch({ type: 'TAKE_GOLD' }); }} className="absolute left-0 top-0 h-full w-1/3 bg-transparent" title="Take Gold" />
                  <button onClick={() => { playSfx('switch_005', { volume: 0.35 }); dispatch({ type: 'DRAW_CARDS_START' }); }} className="absolute left-1/3 top-0 h-full w-1/3 bg-transparent" title="Draw Cards" />
                  <button onClick={() => { playSfx('drop_002', { volume: 0.75 }); dispatch({ type: 'END_TURN' }); }} className="absolute right-0 top-0 h-full w-1/3 bg-transparent" title="End Turn" />
                </div>
              </div>
            )}

            {/* Draw keep modal (when drawCards produced tempChoices) */}
            {ctx.phase === 'action' && isMyTurn && (me?.tempChoices?.length > 0) && (
              <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-8 pointer-events-auto">
                <div className="bg-black/70 border border-amber-900/30 rounded-3xl p-6 shadow-2xl max-w-4xl w-full">
                  <div className="text-amber-400 font-black uppercase tracking-widest text-xs mb-4">Choose 1 to keep</div>
                  <div className="flex gap-6 justify-center items-end">
                    {(me.tempChoices || []).map((c) => (
                      <button key={c.id} onClick={() => dispatch({ type: 'KEEP_CARD', payload: { cardId: c.id } })} className="w-44 aspect-[2/3] rounded-2xl overflow-hidden border-2 border-amber-700/40 hover:border-amber-400 shadow-2xl transition-transform hover:-translate-y-2">
                        <img src={c.img} alt={c.name} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* (removed duplicate built city render) */}

            {/* SP-style ACTION HUD: built city bottom-center + hand fan lower-right */}
            {(() => {
              const city = (me?.city || []).slice(-10);
              const hand = (me?.hand || []);

              const scaleByDist = (dist) => {
                if (dist === 0) return 2;
                if (dist === 1) return 1.35;
                if (dist === 2) return 1.15;
                return 1;
              };

              const cityStep = 26;
              const cityN = Math.max(1, city.length);
              const cityWidth = Math.max(160, (cityN - 1) * cityStep + 160);

              const handStep = 34;
              const handN = Math.max(1, hand.length);
              const handWidth = (handN - 1) * handStep + 144;

              return (
                <>
                  {/* Built districts */}
                  <div
                    className="fixed bottom-[56px] left-1/2 -translate-x-1/2 translate-x-[-260px] z-[999] pointer-events-auto"
                  >
                    <div
                      className="relative h-24"
                      style={{ width: `${cityWidth}px` }}
                      onMouseMove={(e) => {
                        if (!city.length) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const idx = Math.max(0, Math.min(city.length - 1, Math.round(x / cityStep)));
                        setHoverActionCityIndex(idx);
                      }}
                      onMouseLeave={() => setHoverActionCityIndex(null)}
                    >
                      {city.map((c, i) => {
                        const isAbilityCard = (c.name === 'Smithy' || c.name === 'Laboratory');
                        const canActivate = isMyTurn && isAbilityCard;
                        const dist = (hoverActionCityIndex == null) ? 99 : Math.abs(i - hoverActionCityIndex);
                        const scale = (hoverActionCityIndex == null) ? 1 : scaleByDist(dist);
                        const z = (hoverActionCityIndex == null) ? i : (1000 - dist);

                        return (
                          <button
                            key={c.id || i}
                            onClick={() => {
                              if (!canActivate) return;
                              if (c.name === 'Smithy') { playSfx('switch_005', { volume: 0.35 }); dispatch({ type: 'USE_SMITHY' }); }
                              if (c.name === 'Laboratory') { playSfx('switch_005', { volume: 0.35 }); dispatch({ type: 'USE_LAB_START' }); }
                            }}
                            className={
                              'absolute w-36 aspect-[2/3] rounded-xl overflow-visible border border-black/40 shadow-2xl transition-transform duration-200 ' +
                              (isAbilityCard ? (canActivate ? ' ring-2 ring-violet-400/70 shadow-[0_0_24px_rgba(168,85,247,0.55)] cursor-pointer' : ' opacity-60') : '')
                            }
                            style={{
                              left: `${i * cityStep}px`,
                              top: `${i * 2}px`,
                              zIndex: z,
                              transform: `scale(${scale})`,
                              transformOrigin: 'bottom center',
                            }}
                            title={c.name}
                          >
                            <img src={c.img} alt={c.name} className="w-full h-full object-cover" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Hand fan */}
                  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 translate-x-[100px] z-[999] pointer-events-auto">
                    <div
                      className="relative h-56 overflow-visible"
                      style={{ width: `${handWidth}px` }}
                      onMouseMove={(e) => {
                        if (!hand.length) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const idx = Math.max(0, Math.min(hand.length - 1, Math.round(x / handStep)));
                        setHoverActionHandIndex(idx);
                      }}
                      onMouseLeave={() => setHoverActionHandIndex(null)}
                    >
                      {hand.map((card, idx) => {
                        const t = handN <= 1 ? 0.5 : idx / (handN - 1);
                        const rot = (t - 0.5) * 18;
                        const left = idx * handStep;
                        const canBuild = isMyTurn && (me.gold >= card.cost) && (me.builtThisTurn < me.buildLimit) && !(me.city || []).some(b => b.name === card.name);

                        const dist = (hoverActionHandIndex == null) ? 99 : Math.abs(idx - hoverActionHandIndex);
                        const scale = (hoverActionHandIndex == null) ? 1 : scaleByDist(dist);
                        const z = (hoverActionHandIndex == null) ? idx : (1000 - dist);

                        return (
                          <button
                            key={card.id || idx}
                            onClick={() => {
                              if (!canBuild) return;
                              playSfx('drop_002', { volume: 0.75 });
                              dispatch({ type: 'BUILD_DISTRICT', payload: { cardId: card.id } });
                            }}
                            aria-disabled={!canBuild}
                            className={
                              'absolute bottom-0 w-36 aspect-[2/3] rounded-2xl overflow-hidden border-2 transition-all duration-200 ease-out shadow-xl ' +
                              (canBuild ? 'border-amber-700/40 hover:border-amber-400 cursor-pointer' : 'border-slate-900 cursor-not-allowed')
                            }
                            style={{
                              left: `${left}px`,
                              zIndex: z,
                              transform: `rotate(${rot}deg) scale(${scale})`,
                              transformOrigin: 'bottom center',
                            }}
                            title={card.name}
                          >
                            {canBuild && (idx < 9) && (
                              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                                <div className="bg-black/70 border border-amber-500/40 text-amber-200 font-mono font-black text-[10px] px-2 py-0.5 rounded">
                                  {idx + 1}
                                </div>
                              </div>
                            )}
                            <img src={card.img} alt={card.name} className="w-full h-full object-cover" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}
            <div
              className={
                "fixed bottom-4 left-4 z-[950] pointer-events-auto transition-transform duration-300 ease-out " +
                (logCollapsed ? "translate-x-[-360px]" : "translate-x-0")
              }
            >
                <div className="relative w-96 bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-slate-800/50 shadow-2xl flex flex-col h-72">
                    {!logCollapsed && (
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setDevCheatsOpen((v) => !v)} className="w-8 h-6 rounded bg-black/40 border border-slate-800 text-slate-300 text-[10px] font-black" title="Dev cheats (`)">DEV</button>
                          <button className="w-6 h-6 rounded bg-black/40 border border-slate-800 text-slate-300 text-[10px] font-black" title="Hotkeys (H)">H</button>
                          <button onClick={() => setTutorialEnabled((v) => !v)} className="w-6 h-6 rounded bg-black/40 border border-slate-800 text-slate-300 text-[10px] font-black" title="Tutorial (T)">T</button>
                          <button onClick={() => setSoundEnabled((v) => !v)} className="w-6 h-6 rounded bg-black/40 border border-slate-800 text-slate-300 text-[10px] font-black" title="Sound (M)">{soundEnabled ? 'M' : 'M'}</button>
                        </div>
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chronicles & Chat</h3>
                        <button
                          onClick={() => setLogCollapsed((v) => !v)}
                          className="text-[12px] font-black tracking-widest text-amber-500/90 hover:text-amber-400"
                          title="Toggle log (L)"
                        >
                          {'<'}
                        </button>
                      </div>
                    )}

                    {logCollapsed && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <button
                          onClick={() => setLogCollapsed(false)}
                          className="w-8 h-10 rounded-xl bg-black/40 border border-slate-800 text-amber-500 font-black"
                          title="Expand log (L)"
                        >
                          {'>'}
                        </button>
                      </div>
                    )}

                    {!logCollapsed && (
                      <>
                        <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar text-[11px] font-mono">
                            {G?.log?.map((entry, i) => (<div key={`log-${i}`} className="leading-tight border-l border-slate-900 pl-2 text-slate-400">{entry}</div>))}
                            {G?.chat?.map((msg, i) => (<div key={`chat-${i}`} className="leading-tight border-l border-amber-900/40 pl-2"><span className="text-amber-600 font-bold mr-2">{msg.sender}:</span><span className="text-amber-100">{msg.text}</span></div>))}
                            <div ref={logEndRef} />
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); if (chatInput.trim()) { dispatch({ type: 'SUBMIT_CHAT', payload: { text: chatInput } }); setChatInput(""); } }} className="mt-3 flex gap-2 border-t border-slate-800/50 pt-3">
                            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message..." className="flex-1 bg-black/40 border border-slate-800 rounded px-2 py-1 text-[10px] text-amber-100" />
                            <button type="submit" className="px-3 py-1 bg-amber-900/40 border border-amber-900/20 rounded text-[9px] font-black text-amber-500 uppercase">Send</button>
                        </form>
                      </>
                    )}
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const CitadelMultiplayerClient = ({ matchID, playerID, credentials, onJoin }) => {
  if (!matchID) {
    return <CitadelWelcome onJoin={onJoin} />;
  }

  const ClientInstance = Client({
    game: CitadelGame,
    board: MultiplayerSpineUI,
    multiplayer: SocketIO({ server: SERVER }),
    debug: false,
  });

  return <ClientInstance matchID={matchID} playerID={playerID} credentials={credentials} />;
};
