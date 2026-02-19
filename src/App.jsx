import React, { useEffect, useRef, useState } from 'react'
import { GameProvider, useGame, MEDIEVAL_NAMES } from './GameContext'

import { runBotTurn } from './botLogic';
import royalDecreeText from './royal-decree.txt?raw';
import Board from "./components/Board";
import DraftSeats from "./components/DraftSeats";

// --- MULTIPLAYER FEATURE FLAG ---
const SEARCH_PARAMS = new URLSearchParams(window.location.search);
const MULTIPLAYER_ENABLED = SEARCH_PARAMS.get('multiplayer') === 'true' || SEARCH_PARAMS.get('dev') === '1';

import { CitadelMultiplayerClient } from './multiplayer/SpineUI';
// --------------------------------

function MultiplayerManager() {
  const [matchData, setMatchData] = useState(() => {
    const mID = SEARCH_PARAMS.get('matchID');
    const pID = SEARCH_PARAMS.get('playerID');
    if (mID && pID) return { matchID: mID, playerID: pID };
    return null;
  });

  return (
    <ErrorBoundary>
      <CitadelMultiplayerClient 
        matchID={matchData?.matchID} 
        playerID={matchData?.playerID} 
        credentials={matchData?.credentials} 
        onJoin={(data) => setMatchData(data)}
      />
    </ErrorBoundary>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(ErrorBoundary, error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen w-screen bg-black text-amber-200 p-6 font-mono">
          <div className="max-w-3xl mx-auto">
            <div className="text-xl font-black mb-4">Citadel crashed</div>
            <pre className="whitespace-pre-wrap text-sm bg-black/60 border border-amber-900/30 rounded-xl p-4">{String(this.state.error?.stack || this.state.error)}</pre>
            <div className="mt-4 text-xs text-amber-200/70">Send this screenshot to Clop.</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
function GameUI() {
  const { state, dispatch } = useGame();
  const logEndRef = useRef(null);
  const [playerName, setPlayerName] = useState(() => {
    return MEDIEVAL_NAMES[Math.floor(Math.random() * MEDIEVAL_NAMES.length)];
  });
  const isInGame = state.phase !== 'lobby';

  // Viewer seat (human) should not jump to bots during their turns
  const viewerId = state.localPlayerId ?? state.currentPlayerId;
  const viewer = state.players.find(p => p.id === viewerId);

  // Debug: reflect phase in tab title
  useEffect(() => {
    document.title = `Citadel (${state.phase})`;
  }, [state.phase]);

  // Auto-scroll game log to newest
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [state.log.length]);

  // Bot player automation (simple)
  useEffect(() => {
    const current = state.players.find(p => p.id === state.currentPlayerId);
    if (!current?.isBot) return;

    const t = setTimeout(() => {
        runBotTurn(state, dispatch);
    }, 500);

    return () => clearTimeout(t);
  }, [state, dispatch]);


  return (
    <div 
      className={`h-screen w-screen text-slate-100 font-sans bg-cover bg-center bg-fixed bg-no-repeat overflow-hidden flex flex-col ${state.phase === 'lobby' ? 'justify-center' : ''}`} 
      style={{ backgroundImage: `url(${state.phase === 'lobby' ? '/assets/ui/logo_olde_hansa.webp' : '/assets/bg/table.jpg'})` }}
    >
      <div className={isInGame ? "bg-black/25 flex-1 overflow-y-auto p-8" : "bg-transparent p-8 flex items-center justify-center"} style={{ borderRadius: "1.25rem" }}>
      {/* DEBUG_PHASE_BADGE */}
      <div className="fixed top-2 left-2 z-[9999] text-[10px] font-mono font-black text-amber-200 bg-black/70 px-2 py-1 rounded border border-amber-900/30">
        phase={state.phase} players={state.players?.length ?? 0} current={state.currentPlayerId ?? null}
      </div>

        
        {/* Lobby View V3 */}
        {state.phase === 'lobby' && (
          <div className="flex gap-8 items-start max-w-6xl w-full mx-auto px-4 max-h-[85vh]">
            
            {/* Left Panel: Changelog (Scroll Style) */}
            <div className="flex-1 h-full min-h-[400px] relative group flex justify-center items-center">
                <div className="absolute inset-0 bg-contain bg-center bg-no-repeat drop-shadow-xl" style={{ backgroundImage: "url('/assets/ui/scroll_v2.webp')" }}></div>
                <div className="relative z-10 p-16 sm:p-24 h-[75%] w-[85%] overflow-y-auto custom-scrollbar text-center">
                    <h2 className="text-3xl font-serif text-amber-950 font-bold mb-6 border-b border-amber-950/20 pb-2 uppercase tracking-widest">The Royal Decree</h2>
                    <div className="space-y-6 text-amber-950 font-serif text-lg leading-relaxed">
                      {royalDecreeText.trim().split(/\n\n+/).map((block, idx) => {
                        const lines = block.split(/\n/);
                        const title = lines[0] || '';
                        const bullets = lines.slice(1)
                          .filter(l => l.trim().startsWith('-'))
                          .map(l => l.replace(/^\s*-\s?/, '').trim());
                        const body = lines.slice(1)
                          .filter(l => !l.trim().startsWith('-') && l.trim())
                          .join(' ');

                        return (
                          <section key={idx}>
                            <h3 className="font-bold text-xl mb-1 italic">{title}</h3>
                            {bullets.length > 0 ? (
                              <ul className="list-disc pl-5 space-y-1 opacity-90">
                                {bullets.map((b, i) => (<li key={i}>{b}</li>))}
                              </ul>
                            ) : (
                              <p className="opacity-90">{body}</p>
                            )}
                          </section>
                        );
                      })}
                    </div>
                </div>
            </div>

            {/* Right Panel: Lobby (Blurry Style) */}
            <div className="w-80 sm:w-96 flex flex-col h-fit">
                <div className="bg-black/55 backdrop-blur-md p-6 rounded-2xl border border-amber-900/30 flex flex-col shadow-2xl overflow-hidden">
                    <h2 className="text-xl font-serif text-amber-500 font-bold mb-6 text-center uppercase tracking-widest border-b border-amber-500/20 pb-2">The Guest List</h2>
                    
                    {/* Input & Add Block */}
                    <div className="space-y-4 mb-6">
                        <input 
                            type="text" 
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            placeholder="Your Name..."
                            className="w-full bg-slate-900/80 border border-amber-800/50 rounded-xl px-4 py-3 text-amber-100 placeholder-amber-800/40 focus:outline-none focus:border-amber-500 font-serif text-lg transition-all"
                            onKeyDown={(e) => e.key === 'Enter' && playerName && (dispatch({type: 'ADD_PLAYER', payload: playerName}), setPlayerName(''))}
                        />

                        {state.players.length < 7 ? (
                            <div className="flex gap-2 justify-center">
                                <button 
                                    onClick={() => {
                                        if (playerName) {
                                            dispatch({type: 'ADD_PLAYER', payload: playerName});
                                            setPlayerName('');
                                        }
                                    }}
                                    className="transform hover:scale-105 transition-transform active:scale-95 flex-1"
                                >
                                    <img src="/assets/ui/btn_add_player.png" alt="Add Player" className="w-full h-12 object-contain" />
                                </button>
                                <button 
                                    onClick={() => dispatch({type: 'ADD_BOT'})}
                                    className="transform hover:scale-105 transition-transform active:scale-95 flex-1"
                                >
                                    <img src="/assets/ui/btn_add_bot.png" alt="Add Bot" className="w-full h-12 object-contain" />
                                </button>
                            </div>
                        ) : (
                            <div className="text-amber-500 text-center font-bold bg-black/40 py-2 rounded-lg border border-amber-900/30 text-sm">
                                The Hall is Full (Max 7)
                            </div>
                        )}
                    </div>

                    {/* Scrollable Player List */}
                    <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar mb-6 max-h-64">
                        {state.players.map(p => (
                            <div key={p.id} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-xl border border-amber-900/20 hover:bg-slate-900/80 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-full bg-amber-950 flex items-center justify-center text-amber-600 text-xs font-bold border border-amber-900/50">
                                        {p.name[0].toUpperCase()}
                                    </div>
                                    <span className="font-serif text-amber-100 truncate w-32">{p.name} {p.isBot && <span className="text-[10px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded ml-1 font-sans">BOT</span>}</span>
                                </div>
                                <div>
                                    {p.isBot ? (
                                        <button 
                                            onClick={() => dispatch({type: 'REMOVE_PLAYER', payload: p.id})}
                                            className="text-red-900/80 hover:text-red-500 text-[10px] uppercase font-bold tracking-tighter transition-colors"
                                        >
                                            [Dismiss]
                                        </button>
                                    ) : (
                                        <span className="text-amber-600 text-[10px] font-bold uppercase tracking-tighter">Ready</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {state.players.length === 0 && (
                            <div className="text-amber-900/40 text-center py-12 italic font-serif">Awaiting guests...</div>
                        )}
                    </div>

                    {/* Start Action */}
                    {state.players.length >= 2 && (
                        <button 
                            onClick={() => dispatch({type: 'START_GAME'})}
                            className="w-full py-4 bg-gradient-to-r from-amber-800 to-amber-700 hover:from-amber-700 hover:to-amber-600 text-amber-100 font-serif text-xl font-bold rounded-xl shadow-lg border border-amber-500/20 transition-all hover:shadow-amber-900/40 active:scale-95"
                        >
                            Enter the Citadel
                        </button>
                    )}
                                </div>
            </div>
          </div>
        )}

        {/* Game Area (Rest of UI) */}
        {isInGame && (
          <div className="w-full relative">
            {state.phase === 'action' && (
            <div className="hidden lg:block absolute inset-0 z-0 pointer-events-none">
              <Board state={state} />
            </div>
            )}
            <div className="max-w-2xl mx-auto w-full relative z-10">
            {/* Draft View */}
            {state.phase === 'draft' && (
              <>
                <DraftSeats state={state} />

              <div className="relative">
                <h2 className="text-2xl text-amber-500 mb-4 text-center font-serif uppercase tracking-widest">Draft Phase</h2>
                
                <div className="text-center mb-6 font-serif text-lg">
                  <p className="text-slate-300">
                    Current Turn: <span className="font-bold text-amber-400">{state.players.find(p => p.id === state.currentPlayerId)?.name}</span>
                  </p>
                  <p className="text-slate-500 text-sm mt-1 italic">Choose your mask wisely.</p>

                {/* DRAFT_REMOVED_LEFT */}
                <div className="hidden lg:block fixed left-8 top-44 z-30">
                  <div className="text-[10px] uppercase tracking-widest text-amber-200/60 mb-2">Removed Roles</div>
                  <div className="flex items-start gap-3">
                    {state.removedFaceDownRole && (
                      <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden border border-black/40 shadow-xl">
                        <img src="/assets/ui/character_back.jpg" alt="Removed facedown" className="w-full h-full object-cover grayscale opacity-60" />
                      </div>
                    )}
                    {(state.removedFaceUpRoles || []).map(r => (
                      <div key={r.id} className="w-20 aspect-[2/3] rounded-lg overflow-hidden border border-black/40 shadow-xl">
                        <img src={r.img} alt={r.name} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Removed Characters */}
                <div className="mt-6 mb-6 lg:hidden">
                  <div className="text-xs uppercase tracking-widest text-slate-500 mb-4">Removed Roles</div>
                  <div className="flex flex-wrap gap-4 justify-center items-start">
                    {state.removedFaceDownRole && (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden border border-slate-800 bg-slate-950 shadow-lg">
                          <img src="/assets/ui/character_back.jpg" alt="Removed facedown" className="w-full h-full object-cover grayscale opacity-50" />
                        </div>
                        <div className="text-[10px] text-slate-600 uppercase">Hidden</div>
                      </div>
                    )}

                    {state.removedFaceUpRoles && state.removedFaceUpRoles.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {state.removedFaceUpRoles.map(r => (
                          <div key={r.id} className="flex flex-col items-center gap-2">
                            <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shadow-lg">
                              <img src={r.img} alt={r.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="text-[10px] text-slate-400 uppercase">{r.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 lg:flex lg:justify-center lg:items-end lg:gap-0 lg:-space-x-16">
                  {state.availableRoles && state.availableRoles.map(role => (
                    <button
                      key={role.id}
                      onClick={() => dispatch({ type: 'PICK_ROLE', payload: { playerId: state.currentPlayerId, roleId: role.id } })}
                      className="p-0 rounded-xl transition-all group flex flex-col items-center gap-2 overflow-hidden lg:w-36 lg:pt-3 lg:hover:-translate-y-3 lg:hover:z-10"
                    >
                      <div className="w-full aspect-[2/3] rounded-lg overflow-hidden relative">
                        <img 
                            src={role.img} 
                            alt={role.name}
                            className="w-full h-full object-cover opacity-100"
                            onError={(e) => {e.target.style.display='none'}}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              </>
            )}

            {/* Action Phase View */}
            {state.phase === 'action' && (
              <div className="relative text-center">
                 
                 
                 {/* Active Role Card Display */}
                 <div className="fixed bottom-6 right-6 z-40">
                    <div className="relative group w-44 aspect-[2/3] bg-slate-950 rounded-2xl overflow-hidden border-2 border-amber-500/30 shadow-[0_0_50px_rgba(0,0,0,0.5)] mb-4 transition-transform hover:scale-105">
                        {state.roles.find(r => r.id === state.currentRoleId)?.img && (
                            <img 
                                src={state.roles.find(r => r.id === state.currentRoleId).img} 
                                alt="Active Role"
                                className="w-full h-full object-cover"
                            />
                        )}
                    </div>                 </div>

                 <div className="fixed right-6 bottom-44 z-40 flex flex-col gap-3 items-stretch w-72">
                    <button 
                        onClick={() => dispatch({type: 'TAKE_GOLD'})}
                        disabled={state.players.find(p => p.id === state.currentPlayerId)?.hasTakenAction}
                        className="bg-amber-900/40 hover:bg-amber-800/60 disabled:opacity-30 disabled:cursor-not-allowed text-amber-100 px-6 py-4 rounded-xl font-serif font-bold border border-amber-500/20 transition-all flex items-center gap-3 shadow-lg active:scale-95"
                    >
                        <span className="text-2xl">💰</span> Collect Taxes
                    </button>
                    <button 
                        onClick={() => dispatch({type: 'DRAW_CARDS_START'})}
                        disabled={state.players.find(p => p.id === state.currentPlayerId)?.hasTakenAction}
                        className="bg-slate-800/40 hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed text-slate-100 px-6 py-4 rounded-xl font-serif font-bold border border-slate-500/20 transition-all flex items-center gap-3 shadow-lg active:scale-95"
                    >
                        <span className="text-2xl">🃏</span> Study Blueprints
                    </button>

                    {/* Unique building abilities (purple districts) */}
                    {(() => {
                      const me = state.players.find(p => p.id === state.currentPlayerId);
                      const used = me?.usedUniqueThisTurn || {};
                      const has = (name) => (me?.city || []).some(c => c.name === name);
                      return (
                        <>
                          {has('Smithy') && (
                            <button
                              onClick={() => dispatch({type: 'USE_SMITHY'})}
                              disabled={used.smithy || (me?.gold ?? 0) < 2}
                              className="bg-violet-900/40 hover:bg-violet-800/60 disabled:opacity-30 disabled:cursor-not-allowed text-violet-100 px-6 py-4 rounded-xl font-serif font-bold border border-violet-500/20 transition-all flex items-center gap-3 shadow-lg active:scale-95"
                            >
                              <span className="text-2xl">⚒️</span> Smithy (2g → draw 3)
                            </button>
                          )}

                          {has('Laboratory') && (
                            <button
                              onClick={() => dispatch({type: 'USE_LAB_START'})}
                              disabled={used.lab || !(me?.hand || []).length}
                              className="bg-violet-900/40 hover:bg-violet-800/60 disabled:opacity-30 disabled:cursor-not-allowed text-violet-100 px-6 py-4 rounded-xl font-serif font-bold border border-violet-500/20 transition-all flex items-center gap-3 shadow-lg active:scale-95"
                            >
                              <span className="text-2xl">🧪</span> Laboratory (discard → +2g)
                            </button>
                          )}
                        </>
                      );
                    })()}

                    
                    {/* Character Ability Button */}
                    {[1, 2, 3, 8].includes(state.currentRoleId) && !state.interaction && (
                        <button 
                            onClick={() => dispatch({type: 'ACTIVATE_ABILITY'})}
                            className="bg-purple-900/40 hover:bg-purple-800/60 text-purple-100 px-6 py-4 rounded-xl font-serif font-bold border border-purple-500/20 transition-all flex items-center gap-3 shadow-lg active:scale-95"
                        >
                            <span className="text-2xl">✨</span> Cast Spell
                        </button>
                    )}
                    <button
                        onClick={() => dispatch({type: 'END_TURN'})}
                        className="bg-black/45 hover:bg-black/65 text-amber-200/80 hover:text-amber-200 px-6 py-4 rounded-xl border border-amber-900/20 font-serif font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                        End Turn
                    </button>

                 </div>

                 {/* Interaction Modal */}
                 {state.interaction && (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-slate-900 p-8 rounded-2xl border border-amber-900/30 max-w-lg w-full shadow-2xl">
                            <h3 className="text-2xl text-amber-500 font-serif font-bold mb-8 text-center uppercase tracking-widest">
                                {state.interaction.type === 'ASSASSINATE' ? 'Target for Assassination' : 
                                 state.interaction.type === 'STEAL' ? 'Target for Theft' :
                                 state.interaction.type === 'DESTROY' ? 'District to Raze' :
                                 state.interaction.type === 'MAGIC' ? 'Magician' :
                                 state.interaction.type === 'MAGIC_SWAP_PLAYER' ? 'Magician' :
                                 state.interaction.type === 'LAB_DISCARD' ? 'Choose a card to discard' : 'Royal Edict'}
                            </h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                {(() => {
                                    if (state.interaction.type === 'LAB_DISCARD') {
                                        const me = state.players.find(p => p.id === state.currentPlayerId);
                                        const ids = (me?.hand || []).map(c => c.id);
                                        return ids;
                                    }
                                    return state.interaction.options || [];
                                })().map((opt) => {
                                    
                                    if (state.interaction.type === 'LAB_DISCARD') {
                                        const me = state.players.find(p => p.id === state.currentPlayerId);
                                        const card = me?.hand?.find(c => c.id === opt);
                                        if (!me || !card) return null;
                                        return (
                                            <button
                                                key={opt}
                                                onClick={() => dispatch({type: 'USE_LAB_DISCARD', payload: { cardId: opt }})}
                                                className="bg-slate-950 hover:bg-violet-900/20 p-4 rounded-xl border border-slate-800 flex flex-col items-center gap-2 transition-all hover:border-violet-900/50"
                                            >
                                                <span className="text-amber-100 font-serif font-bold">{card.name}</span>
                                                <span className="text-[10px] uppercase text-slate-500 tracking-widest">Cost {card.cost}</span>
                                            </button>
                                        );
                                    }

if (state.interaction.type === 'DESTROY') {
                                        const targetPlayer = state.players.find(p => p.id === opt.playerId);
                                        const card = targetPlayer?.city?.find(c => c.id === opt.cardId);
                                        if (!targetPlayer || !card) return null;
                                        const targetHasGreatWall = (targetPlayer?.city || []).some(c => c.name === 'Great Wall');
                                        const cost = Math.max(0, (card.cost || 0) - 1) + (targetHasGreatWall ? 1 : 0);
                                        return (
                                            <button
                                                key={opt.playerId + '-' + opt.cardId}
                                                onClick={() => dispatch({type: 'RESOLVE_INTERACTION', payload: { type: 'DESTROY', playerId: opt.playerId, cardId: opt.cardId }})}
                                                className="bg-slate-950 hover:bg-red-950/40 p-4 rounded-xl border border-slate-800 flex flex-col items-center gap-2 transition-all hover:border-red-900/50 group"
                                            >
                                                <span className="text-[10px] uppercase text-slate-500 tracking-widest">{targetPlayer.name}</span>
                                                <span className="text-amber-100 font-serif font-bold">{card.name}</span>
                                                <span className="text-[10px] font-bold text-red-800 bg-red-950/50 px-2 py-0.5 rounded uppercase">Cost: {cost} Gold</span>
                                            </button>
                                        );
                                    }

                                    const targetId = opt;
                                    const role = state.roles.find(r => r.id === targetId);
                                    if (!role) return null;
                                    return (
                                        <button
                                            key={targetId}
                                            onClick={() => dispatch({type: 'RESOLVE_INTERACTION', payload: { type: state.interaction.type, target: targetId }})}
                                            className="bg-slate-950 hover:bg-amber-900/20 p-6 rounded-xl border border-slate-800 flex flex-col items-center gap-2 transition-all hover:border-amber-900/50"
                                        >
                                            <span className="text-2xl font-serif text-amber-500 font-bold uppercase tracking-tighter">{role.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <button 
                                onClick={() => dispatch({type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' }})}
                                className="mt-8 text-slate-600 hover:text-slate-400 w-full py-2 font-serif uppercase text-xs tracking-widest transition-colors"
                            >
                                Reconsider
                            </button>
                        </div>
                    </div>
                 )}

                 {/* Draw Modal */}
                 {state.isDrawing && (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-md">
                        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 max-w-2xl w-full shadow-2xl">
                            <h3 className="text-3xl text-amber-500 font-serif font-bold mb-8 text-center uppercase tracking-widest">Select One Plan</h3>
                            <div className="flex gap-6 justify-center mb-8">
                                {state.drawnCards.map(card => (
                                    <button 
                                        key={card.id}
                                        onClick={() => dispatch({type: 'KEEP_CARD', payload: { cardId: card.id }})}
                                        className="group relative w-44 aspect-[2/3] rounded-2xl overflow-hidden border-2 border-slate-800 hover:border-amber-500/50 hover:scale-105 transition-all shadow-xl shadow-black"
                                    >
                                        <img src={card.img} alt={card.name} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                            <p className="text-slate-600 text-center font-serif italic">The unchosen path will be lost to time.</p>
                            <button
                              onClick={() => dispatch({type: CANCEL_DRAW})}
                              className="mt-6 text-slate-600 hover:text-slate-400 w-full py-2 font-serif uppercase text-xs tracking-widest transition-colors"
                            >
                              Cancel
                            </button>
                        </div>
                    </div>
                 )}
                 {/* Player Hand & City */}
                 <div className="mt-12 border-t border-slate-800 pt-8 text-left">
                    <h3 className="text-xl text-amber-600 font-serif font-bold mb-6 uppercase tracking-widest flex justify-between items-center">
                         
                        <span className="text-xs text-slate-600 normal-case tracking-normal italic font-normal">{viewer?.city?.length || 0} districts built</span>
                    </h3>
                    <div className="flex gap-4 overflow-x-auto pb-6 custom-scrollbar min-h-[160px]">
                        {viewer?.city?.map(card => (
                            <div key={card.id} className="relative w-36 aspect-[2/3] rounded-xl border border-slate-800 overflow-hidden flex-shrink-0 grayscale-[0.2] transition-transform hover:-rotate-1 shadow-lg shadow-black">
                                <img src={card.img} alt={card.name} className="w-full h-full object-cover" />
                            </div>
                        ))}
                        {(!viewer?.city?.length) && <div className="text-slate-800 italic py-12 px-4 font-serif">No structures yet constructed in this domain.</div>}
                    </div>

                    <h3 className="text-xl text-amber-600 font-serif font-bold mb-6 mt-8 uppercase tracking-widest"></h3>
                    <div className="relative h-56 overflow-visible">
                        {(viewer?.hand || []).map((card, idx, arr) => {
                            const actingPlayer = state.players.find(p => p.id === state.currentPlayerId);
                            const isMyTurn = viewer?.id === actingPlayer?.id;
                            const buildLimit = viewer?.buildLimit ?? 1;
                            const builtThisTurn = viewer?.builtThisTurn ?? 0;
                            const canBuild = isMyTurn && (viewer?.gold >= card.cost) && (builtThisTurn < buildLimit);

                            const n = Math.max(1, arr.length);
                            const t = n <= 1 ? 0.5 : idx / (n - 1);
                            const rot = (t - 0.5) * 18;
                            const left = idx * 30;

                            return (
                                <button
                                    key={card.id}
                                    onClick={() => canBuild && dispatch({type: 'BUILD_DISTRICT', payload: { cardId: card.id }})}
                                    disabled={!canBuild}
                                    className={
                                      "absolute bottom-0 w-36 aspect-[2/3] rounded-2xl overflow-hidden border-2 transition-all shadow-xl hover:z-50 " +
                                      (canBuild
                                        ? "border-amber-700/40 hover:border-amber-400 cursor-pointer"
                                        : "border-slate-900 opacity-25 cursor-not-allowed")
                                    }
                                    style={{ left: `${left}px`, transform: `rotate(${rot}deg)`, transformOrigin: 'bottom center' }}
                                >
                                    <img src={card.img} alt={card.name} className="w-full h-full object-cover transition-transform duration-150 hover:scale-[2]" />
                                </button>
                            );
                        })}
                        {(!viewer?.hand?.length) && <div className="text-slate-800 italic py-12 px-4 font-serif">The archive of plans is currently empty.</div>}
                    </div>
                 </div>
              </div>
            )}

            {/* Game Over View */}
            {state.phase === 'game_over' && (
              <div className="bg-slate-950 p-12 rounded-3xl border-4 border-amber-900 shadow-[0_0_100px_rgba(120,53,15,0.2)] text-center animate-in fade-in zoom-in duration-700">
                <h2 className="text-5xl text-amber-500 mb-12 font-serif font-black uppercase tracking-[0.2em]">Ascension</h2>
                
                <div className="space-y-6 max-w-md mx-auto">
                    {state.players.map((p, i) => (
                        <div key={p.id} className={`flex items-center justify-between p-6 rounded-2xl border transition-all ${i===0 ? 'bg-amber-900/20 border-amber-500 scale-110 shadow-2xl' : 'bg-black/40 border-slate-900 opacity-60'}`}>
                            <div className="flex items-center gap-6">
                                <span className={`text-4xl font-serif font-black ${i===0 ? 'text-amber-500' : 'text-slate-800'}`}>#{i+1}</span>
                                <div className="text-left font-serif">
                                    <div className="font-bold text-white text-2xl uppercase tracking-tighter">{p.name}</div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                                        D: {p.districtScore} | C: {p.hasAllColors ? '+3' : '0'} | F: {p.firstBuilderBonus ? '+4' : '0'}
                                    </div>
                                </div>
                            </div>
                            <div className="text-4xl font-black text-amber-400 font-serif">{p.score}</div>
                        </div>
                    ))}
                </div>

                <button 
                    onClick={() => window.location.reload()}
                    className="mt-16 bg-transparent text-slate-700 hover:text-amber-500 underline font-serif uppercase tracking-[0.3em] text-xs transition-colors"
                >
                    Reclaim the Throne
                </button>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Game Log (HUD Only) */}
        {isInGame && (
          <div className="fixed bottom-4 left-4 max-w-sm w-full z-40 hidden lg:block">
            <div className="bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-slate-800/50 shadow-2xl">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="w-1 h-1 bg-red-600 rounded-full animate-pulse"></div> Chronicles
              </h3>
              <div className="h-48 overflow-y-auto space-y-1 pr-2 custom-scrollbar text-[11px] font-mono text-slate-400">
                {state.log.map((entry, i) => (
                  <div key={i} className="leading-tight border-l border-slate-900 pl-2">
                    <span className="text-slate-700 mr-2">{i+1}</span>
                    {entry}
                  </div>
                ))}
                <div ref={logEndRef} />
                                              </div>
            </div>
          </div>
        )}

        {/* Global End Handlers */}
        {(state.phase === 'round_end_check' || state.phase === 'end_round') && (
            <div className="fixed inset-0 flex items-center justify-center bg-black/95 z-50 p-4">
                <div className="bg-slate-900 p-12 rounded-3xl text-center border border-amber-900/30 max-w-lg w-full shadow-2xl">
                    <h2 className="text-3xl text-amber-500 font-serif font-bold mb-6 uppercase tracking-[0.2em]">Decree</h2>
                    <p className="text-slate-400 font-serif italic mb-10 leading-relaxed">
                        {state.phase === 'round_end_check' ? "The master builders have signaled completion. Final tallies must be prepared." : "The roles of this round have been played. A new dawn awaits."}
                    </p>
                    <button 
                        onClick={() => dispatch({type: state.phase === 'round_end_check' ? 'END_GAME_SCORING' : 'START_NEW_ROUND'})}
                        className="w-full bg-amber-950/40 hover:bg-amber-900/60 text-amber-100 py-5 rounded-2xl border border-amber-500/20 font-serif font-bold uppercase tracking-widest transition-all shadow-xl active:scale-95"
                    >
                        {state.phase === 'round_end_check' ? "See Results" : "Next Round"}
                    </button>
                                </div>
            </div>
        )}

      </div>

      {/* Build Version Badge */}
      <div className="fixed bottom-3 right-3 text-xs font-mono font-black text-black select-none z-50 pointer-events-none uppercase tracking-[0.15em]">
          Citadel {__GIT_BRANCH__} #{__GIT_SHA__}
      </div>
    </div>
  )
}

function App() {
  if (MULTIPLAYER_ENABLED) {
    return <MultiplayerManager />;
  }

  return (
    <GameProvider>
      <ErrorBoundary>
        <GameUI />
      </ErrorBoundary>
    </GameProvider>
  )
}

export default App
