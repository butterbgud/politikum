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

function Card({ card, onClick, disabled, showCheck }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'relative w-32 aspect-[2/3] rounded-2xl overflow-hidden border shadow-2xl transition-transform ' +
        (disabled ? 'opacity-40 cursor-not-allowed border-black/30' : 'cursor-pointer hover:scale-[1.03] border-amber-500/30')
      }
      title={card?.id}
    >
      <img src={card.img} alt={card.id} className="w-full h-full object-cover" draggable={false} />
      {showCheck && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-6 h-6 rounded-full bg-white/90 text-black border border-black/20 flex items-center justify-center text-[14px] font-black shadow">
          ✓
        </div>
      )}
    </button>
  );
}

function Board({ G, ctx, moves, playerID }) {
  // H toggles on-screen hotkey hints (badges like (c)/(e)/(1..n)).
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('politikum:soundOn') !== '0'; } catch { return true; }
  });

  const sfx = useMemo(() => {
    const mk = (file) => {
      const a = new Audio(`/assets/sfx/${file}`);
      a.preload = 'auto';
      return a;
    };
    return {
      draw: mk('card-slide-7.ogg'),
      play: mk('card-place-2.ogg'),
      flip: mk('cardflip.ogg'),
      coin: mk('coin.ogg'),
      ui: mk('switch_005.ogg'),
      error: mk('error_008.ogg'),
      win: mk('win.ogg'),
      lose: mk('lose.ogg'),
    };
  }, []);

  const playSfx = (key, vol = 0.6) => {
    if (!soundOn) return;
    const a = sfx?.[key];
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
      a.volume = vol;
      a.play();
    } catch {}
  };
  // Legacy states kept only to avoid touching large JSX blocks.
  // Hotkey/tutorial overlays are hard-disabled below.
  const [showTutorial, setShowTutorial] = useState(false);
  const [pickTargetForAction4, setPickTargetForAction4] = useState(null); // { cardId } (targeting mode)
  const [pickTargetForAction9, setPickTargetForAction9] = useState(null); // { cardId } (targeting mode)
  const [placementMode, setPlacementMode] = useState(null); // { cardId, neighborId, side }
  const [placementModeOpp, setPlacementModeOpp] = useState(null); // { cardId, targetId, neighborId, side }
  const [pickTargetForPersona9, setPickTargetForPersona9] = useState(null); // { cardId }
  const logRef = React.useRef(null);
  const me = (G.players || []).find((p) => String(p.id) === String(playerID));

  // ✓ = fully polished (per IMPLEMENTATION.md)
  const POLISHED = useMemo(() => {
    const s = new Set([
      // Events
      'event_1','event_2','event_3','event_10','event_11','event_12a','event_12b','event_12c','event_15','event_16',
      // Actions
      'action_4','action_5','action_6','action_7','action_8','action_9','action_13','action_14','action_17','action_18',
      // Personas
      'persona_1','persona_2','persona_3','persona_4','persona_5','persona_6','persona_14','persona_19','persona_20','persona_25','persona_27','persona_29','persona_30','persona_31','persona_35','persona_40','persona_42','persona_44'
    ]);
    return s;
  }, []);

  const isPolishedCard = (card) => {
    const bid = String(card?.id || '').split('#')[0];
    return POLISHED.has(bid);
  };
  const isMyTurn = String(ctx.currentPlayer) === String(playerID) && !G.gameOver;
  const current = (G.players || []).find((p) => String(p.id) === String(ctx.currentPlayer));
  const currentIsBot = String(current?.name || '').startsWith('[B]');
  const response = G.response || null;
  const pending = G.pending || null;
  const responseKind = response?.kind || null;
  const responseExpiresAt = Number(response?.expiresAtMs || 0);
  const responseSecondsLeft = Math.max(0, Math.ceil((responseExpiresAt - Date.now()) / 1000));
  // Use a small grace window to avoid client clock skew blocking cancels.
  // Server enforces the real deadline.
  const responseActive = !!responseKind && (responseExpiresAt - Date.now()) > -750;
  const haveAction6 = (me?.hand || []).some((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_6');
  const haveAction8 = (me?.hand || []).some((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_8');
  const haveAction14 = (me?.hand || []).some((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_14');
  const responseTargetsMe = !!pending && (pending.kind === 'action_4_discard' || pending.kind === 'action_9_discard_persona') && String(pending.targetId) === String(playerID);
  const canPersona10Cancel = responseKind === 'cancel_action' && String(response?.allowPersona10By || '') === String(playerID) && responseTargetsMe;
  const p8SwapSpec = responseKind === 'cancel_persona' ? (response?.persona8Swap || null) : null;
  const canPersona8Swap = !!p8SwapSpec && String(p8SwapSpec.playerId || '') === String(playerID);
  const [showEventSplash, setShowEventSplash] = useState(false);
  const [showActionSplash, setShowActionSplash] = useState(false);
  const ENABLE_EVENT_SPLASH = true;
  const ENABLE_ACTION_SPLASH = false;

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

  const pendingTokens = pending?.kind === 'place_tokens_plus_vp' && String(pending?.playerId) === String(playerID);
  const pendingTokensRemaining = pendingTokens ? Number(pending?.remaining || 0) : 0;
  const pendingTokensSource = pendingTokens ? String(pending?.sourceCardId || '') : '';

  const pendingPersona45 = pending?.kind === 'persona_45_steal_from_opponent' && String(pending?.playerId) === String(playerID);
  const pendingPersona45Source = pendingPersona45 ? String(pending?.sourceCardId || '') : '';

  const pendingP21 = pending?.kind === 'persona_21_pick_target_invert' && String(pending?.playerId) === String(playerID);
  const pendingP21Source = pendingP21 ? String(pending?.sourceCardId || '') : '';
  const pendingP23 = pending?.kind === 'persona_23_choose_self_inflict_draw' && String(pending?.playerId) === String(playerID);
  const pendingP23Source = pendingP23 ? String(pending?.sourceCardId || '') : '';
  const pendingP26 = pending?.kind === 'persona_26_pick_red_nationalist' && String(pending?.playerId) === String(playerID);
  const pendingP26Source = pendingP26 ? String(pending?.sourceCardId || '') : '';
  const pendingP28 = pending?.kind === 'persona_28_pick_non_fbk' && String(pending?.playerId) === String(playerID);
  const pendingP28Source = pendingP28 ? String(pending?.sourceCardId || '') : '';

  const pendingP32 = pending?.kind === 'persona_32_pick_bounce_target' && String(pending?.playerId) === String(playerID);
  const pendingP32Source = pendingP32 ? String(pending?.sourceCardId || '') : '';


  const isImmovablePersona = (card) => card?.type === 'persona' && String(card.id).split('#')[0] === 'persona_31';

  // Hand fan geometry (ported from Citadel MP)
  const cards = hand;
  const fanN = Math.max(1, cards.length);
  const cardW = 144; // ~ w-36
  const handStep = Math.min(28, Math.max(10, 180 / Math.max(1, fanN - 1)));
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
      if (key === 'escape') {
        setPickTargetForAction4(null);
        setPickTargetForAction9(null);
        setPlacementMode(null);
        return;
      }
      if (key === 'h') {
        setShowHotkeys((v) => !v);
        return;
      }
      if (key === 'm') {
        setSoundOn((v) => {
          const nv = !v;
          try { localStorage.setItem('politikum:soundOn', nv ? '1' : '0'); } catch {}
          return nv;
        });
        playSfx('ui', 0.4);
        return;
      }
      if (key === 't') {
        setShowTutorial((v) => !v);
        return;
      }
      if (key === 'c') {
        if (!isMyTurn || G.hasDrawn) return;
        playSfx('draw');
        moves.drawCard();
        return;
      }
      if (key === 'e') {
        if (!isMyTurn || !G.hasDrawn || !G.hasPlayed) return;
        playSfx('ui');
        moves.endTurn();
        return;
      }

      // Fast cancels during response windows
      if (responseKind && key === '1') {
        // action_6 cancels actions (anyone)
        if (responseKind === 'cancel_action' && String(response?.playedBy) !== String(playerID)) {
          const c6 = (me?.hand || []).find((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_6');
          if (c6) moves.playAction(c6.id);
        }
        // action_8 cancels persona plays (anyone)
        if (responseKind === 'cancel_persona' && String(response?.playedBy) !== String(playerID)) {
          const c8 = (me?.hand || []).find((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_8');
          if (c8) moves.playAction(c8.id);
        }
        // action_14 cancels the effect of an action that is targeting YOU
        if (responseKind === 'cancel_action' && responseTargetsMe) {
          const c14 = (me?.hand || []).find((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_14');
          if (c14) moves.playAction(c14.id);
        }
        return;
      }

      // p23 choice: 0..3 tokens
      if (pendingP23 && (key === '0' || key === '1' || key === '2' || key === '3')) {
        try { moves.persona23ChooseSelfInflict(Number(key)); } catch {}
        return;
      }

      // Number hotkeys for hand (quick-play): 1..9, 0 = 10
      if (!responseActive && !pendingP23 && (key === '0' || (key >= '1' && key <= '9'))) {
        const n = key === '0' ? 10 : Number(key);
        const idx = n - 1;
        const card = (me?.hand || [])[idx];
        if (!card) return;

        const baseId = String(card.id).split('#')[0];
        const canPlayPersona = isMyTurn && G.hasDrawn && card.type === 'persona';
        const canPlayAction = isMyTurn && G.hasDrawn && !G.hasPlayed && card.type === 'action';
        if (canPlayPersona) moves.playPersona(card.id);
        else if (canPlayAction) {
          if (baseId === 'action_4') setPickTargetForAction4({ cardId: card.id });
          else if (baseId === 'action_9') setPickTargetForAction9({ cardId: card.id });
          else moves.playAction(card.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMyTurn, G.hasDrawn, G.hasPlayed, moves, responseKind, responseSecondsLeft, response?.playedBy, playerID, me?.hand]);

  // Drive bot turns (pacing): tick only when it's a bot turn.
  // Calling tickBot during human turns causes invalid stateID spam and can wedge the match.
  useEffect(() => {
    if (G?.gameOver) return;
    if (!currentIsBot) return;

    const t = setInterval(() => {
      try { moves.tickBot(); } catch {}
    }, 900);
    return () => clearInterval(t);
  }, [moves, currentIsBot, G?.gameOver]);

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
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[700] flex gap-10 pointer-events-auto">
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
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/55 border border-amber-900/20 rounded-full px-4 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90 z-[2000] whitespace-nowrap min-w-[180px] justify-center">
                <span>{p.name}</span>
                <span className="text-amber-200/50">•</span>
                <span className="text-amber-200/80">{pts}p</span>
              </div>

              {/* single opponent fan (coalition + hand) */}
              <div
                className={
                  "relative h-44 pointer-events-auto transition-colors rounded-2xl " +
                  ((pickTargetForAction4 || pickTargetForAction9 || pendingPersona45 || pickTargetForPersona9 || (placementModeOpp && String(placementModeOpp.targetId) === String(p.id))) ? "cursor-pointer ring-2 ring-emerald-500/30 hover:ring-emerald-300/50" : "")
                }
                style={{ width: Math.max(width, 260) }}
                onClick={() => {
                  if (pendingPersona45) {
                    try { moves.persona45StealFromOpponent(String(p.id)); } catch {}
                    return;
                  }
                  if (pickTargetForPersona9) {
                    const coalFaces = (p.coalition || []).filter((c) => c.type === 'persona');
                    if (coalFaces.length >= 1) {
                      playSfx('ui', 0.35);
                      setPlacementModeOpp({ cardId: pickTargetForPersona9.cardId, targetId: String(p.id), neighborId: null, side: 'right' });
                      setPickTargetForPersona9(null);
                      return;
                    }
                    try { playSfx('play'); moves.playPersona(pickTargetForPersona9.cardId, undefined, 'right', String(p.id)); } catch {}
                    setPickTargetForPersona9(null);
                    return;
                  }
                  if (pickTargetForAction4) {
                    try { moves.playAction(pickTargetForAction4.cardId, String(p.id)); } catch {}
                    setPickTargetForAction4(null);
                    return;
                  }
                  if (pickTargetForAction9) {
                    try { moves.playAction(pickTargetForAction9.cardId, String(p.id)); } catch {}
                    setPickTargetForAction9(null);
                  }
                }}
                onPointerMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX ?? 0) - rect.left;
                  // Note: opponent fan has variable spacing; use proportional index for hover.
                  const idx = Math.max(0, Math.min(show - 1, Math.floor((x / Math.max(1, width)) * show)));
                  setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: idx }));
                }}
                onPointerEnter={() => {
                  const idx = Math.max(0, Math.floor((show - 1) / 2));
                  setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: idx }));
                }}
                onPointerLeave={() => setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: null }))}
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
                  const oppPlaceActive = !!placementModeOpp && String(placementModeOpp.targetId) === String(p.id);
                  const canClickFaceForOppPlace = oppPlaceActive && it.kind === 'face' && it.card?.type === 'persona';

                  const canClickFaceForP8Swap = canPersona8Swap && it.kind === 'face' && String(it.card?.id) === String(p8SwapSpec?.playedPersonaId) && String(p.id) === String(p8SwapSpec?.ownerId);

                  // persona picks (no modal)
                  const canClickFaceForP21 = pendingP21 && it.kind === 'face' && it.card?.type === 'persona' && !isImmovablePersona(it.card);
                  const canClickFaceForP26 = pendingP26 && it.kind === 'face' && it.card?.type === 'persona' && Array.isArray(it.card?.tags) && it.card.tags.includes('faction:red_nationalist') && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP28 = pendingP28 && it.kind === 'face' && it.card?.type === 'persona' && !(Array.isArray(it.card?.tags) && it.card.tags.includes('faction:fbk')) && !it.card?.shielded && !isImmovablePersona(it.card);

                  const canClickFace = canClickFaceForOppPlace || canClickFaceForP8Swap || canClickFaceForP21 || canClickFaceForP26 || canClickFaceForP28;
                  return (
                    <div
                      key={`${p.id}-${i}-${id}`}
                      className={"absolute bottom-0 w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl " + (canClickFace ? "cursor-pointer ring-2 ring-emerald-400/40" : "")}
                      style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: 'bottom center' }}
                      title={id}
                      onClick={() => {
                        if (!canClickFace) return;
                        if (canClickFaceForP8Swap) {
                          try { playSfx('ui', 0.35); moves.persona8SwapWithPlayedPersona(); } catch {}
                          return;
                        }
                        if (canClickFaceForOppPlace) {
                          setPlacementModeOpp((m) => ({ ...(m || {}), neighborId: it.card.id }));
                          return;
                        }
                        if (canClickFaceForP21) {
                          try { playSfx('ui', 0.35); moves.persona21InvertTokens(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForP26) {
                          try { playSfx('ui', 0.35); moves.persona26PurgeRedNationalist(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForP28) {
                          try { playSfx('ui', 0.35); moves.persona28StealPlusTokens(String(p.id), it.card.id, 3); } catch {}
                          return;
                        }
                      }}
                    >
                      <img src={img} alt={id} className="w-full h-full object-cover" draggable={false} />
                      {(it.kind === 'face' && Number(it.card?.vpDelta || 0) !== 0) && (
                        <div className={
                          "absolute left-2 bottom-2 w-7 h-7 rounded-full border flex items-center justify-center text-white font-black text-[13px] " +
                          (Number(it.card?.vpDelta || 0) < 0 ? "bg-red-700/90 border-red-200/30" : "bg-emerald-700/90 border-emerald-200/30")
                        }>
                          {it.card.vpDelta}
                        </div>
                      )}
                      {it.kind === 'face' && (it.card?.shielded || it.card?.blockedAbilities) && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-1 text-[9px] font-mono font-black">
                          {it.card?.shielded && (
                            <span className="px-1.5 py-0.5 rounded-full bg-sky-700/90 border border-sky-300/40 text-sky-50 shadow-md">SH</span>
                          )}
                          {it.card?.blockedAbilities && (
                            <span className="px-1.5 py-0.5 rounded-full bg-red-800/90 border border-red-300/40 text-red-50 shadow-md">X</span>
                          )}
                        </div>
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
          onClick={() => { if (!isMyTurn || G.hasPlayed || (G.drawsThisTurn || 0) >= 2) return; playSfx('draw'); moves.drawCard(); }}
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
          onClick={() => { if (!isMyTurn || !G.hasDrawn || !G.hasPlayed) return; playSfx('ui'); moves.endTurn(); }}
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

      {/* Pending banner */}
      {pendingTokens && pendingTokensRemaining > 0 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingTokensSource || 'EVENT'}: place +1 tokens on your coalition — click a coalition card ({pendingTokensRemaining} left)
          </div>
        </div>
      )}

      {pendingP21 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP21Source}: click any persona on the table to invert its tokens
          </div>
        </div>
      )}

      {pendingP26 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP26Source}: click a red_nationalist persona to discard + inherit its +1
          </div>
        </div>
      )}

      {pendingP28 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP28Source}: click a non-FBK persona to steal up to 3 × +1 (auto)
          </div>
        </div>
      )}

      {pendingP23 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP23Source}: choose self-inflict (-1) tokens then draw
            <span className="ml-3 text-amber-200/70">(keys 0..3)</span>
          </div>
        </div>
      )}

      {pendingP32 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP32Source}: click a persona in YOUR coalition to return it to hand
          </div>
        </div>
      )}

      {/* Targeting prompt (action_4) */}
      {((!!pickTargetForAction4) || (!!pickTargetForAction9)) && (
        <div className="fixed inset-0 z-[3200] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/55 border border-amber-900/20 rounded-2xl px-5 py-4 backdrop-blur-sm shadow-2xl">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">{pickTargetForAction4 ? 'Action 4' : 'Action 9'}</div>
            <div className="mt-2 text-amber-100/85 text-sm font-mono whitespace-pre">
              {pickTargetForAction4
                ? `Pick an opponent. They will discard 1 coalition card of their choice.\nClick their hand. (Esc to cancel)`
                : `Pick an opponent. Discard 1 persona from their coalition.\nClick their hand. (Esc to cancel)`}
            </div>
          </div>
        </div>
      )}

      {/* Response window banner */}
      {responseActive && (
        (responseKind === 'cancel_action' && (haveAction6 || (haveAction14 && responseTargetsMe))) ||
        (responseKind === 'cancel_persona' && haveAction8)
      ) && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {responseKind === 'cancel_persona' && haveAction8 && 'Persona played — respond with Action 8 to cancel'}
            {responseKind === 'cancel_action' && haveAction6 && 'Action played — respond with Action 6 to cancel'}
            {responseKind === 'cancel_action' && !haveAction6 && haveAction14 && responseTargetsMe && 'You are targeted — respond with Action 14 to cancel the effect'}
            <span className="ml-3 text-amber-200/70">{responseSecondsLeft}s</span>
          </div>
        </div>
      )}

      {/* Tutorial: simple center-board text (toggle T) */}
      {showTutorial && (
        <div className="fixed inset-0 z-[3200] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/55 border border-amber-900/20 rounded-2xl px-5 py-4 backdrop-blur-sm shadow-2xl">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Tutorial (T)</div>
            <div className="mt-2 text-amber-100/85 text-sm font-mono whitespace-pre">
              {`1) Draw: C (or click deck)\n2) Play: click a card (or 1..9, 0=10)\n3) End: E (or click cookies)\n\nL toggles logs · H toggles hint badges`}
            </div>
          </div>
        </div>
      )}

      {/* Action_4 / Action_9 discard prompt (target chooses) */}
      {(G.pending?.kind === 'action_4_discard' || G.pending?.kind === 'action_9_discard_persona') && String(playerID) === String(G.pending.targetId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[700px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Discard from coalition</div>
            <div className="mt-2 text-amber-100/80 text-sm">
              {G.pending?.kind === 'action_9_discard_persona'
                ? 'Choose 1 PERSONA from your coalition to discard.'
                : 'Choose 1 card from your coalition to discard.'}
            </div>
            <div className="mt-4 flex gap-3 flex-wrap">
              {(me?.coalition || []).filter((c) => (G.pending?.kind === 'action_9_discard_persona' ? c.type === 'persona' : true) && !c.shielded && !isImmovablePersona(c)).map((c) => (
                <Card
                  key={c.id}
                  card={c}
                  onClick={() => moves.discardFromCoalition(c.id)}
                  disabled={false}
                  showCheck={isPolishedCard(c)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Event_12b: each affected player discards 1 card from hand */}
      {G.pending?.kind === 'event_12b_discard_from_hand' && Array.isArray(G.pending.targetIds) && G.pending.targetIds.includes(String(playerID)) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[700px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Discard from hand</div>
            <div className="mt-2 text-amber-100/80 text-sm">EVENT {G.pending.sourceCardId}: choose 1 card from your hand to discard.</div>
            <div className="mt-4 flex gap-3 flex-wrap">
              {(me?.hand || []).map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.discardFromHandForEvent12b(c.id)}
                  title={c.name || c.id}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
              {!(me?.hand || []).length && (
                <div className="text-amber-200/70 text-sm">You have no cards to discard.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persona_3 choice prompt */}
      {G.pending?.kind === 'persona_3_choice' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[720px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">SVTV (p3) — choose one</div>
            <div className="mt-3 flex flex-col gap-3">
              <button
                className="px-4 py-3 rounded-xl bg-amber-950/40 hover:bg-amber-950/60 border border-amber-900/20 text-left"
                onClick={() => {
                  // discard first available leftwing persona from selected owner (simple)
                  const opts = (G.players || []).filter((p) => (p.coalition || []).some((c) => c.type === 'persona' && Array.isArray(c.tags) && c.tags.includes('faction:leftwing') && !c.shielded));
                  const owner = opts[0];
                  if (!owner) return;
                  moves.persona3ChooseOption('a', String(owner.id));
                }}
              >
                Discard a leftwing persona (any coalition)
              </button>
              <button
                className="px-4 py-3 rounded-xl bg-amber-950/40 hover:bg-amber-950/60 border border-amber-900/20 text-left"
                onClick={() => moves.persona3ChooseOption('b')}
              >
                Remove up to 2 +1 tokens from all leftwing personas in opponents' coalitions
              </button>
            </div>
            <div className="mt-4 text-amber-200/60 text-xs">(We can upgrade option A to let you pick exact target.)</div>
          </div>
        </div>
      )}

      {/* Persona_5 target prompt */}
      {G.pending?.kind === 'persona_5_pick_liberal' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Pevchih (p5)</div>
            <div className="mt-2 text-amber-100/80 text-sm">Discard a liberal persona from an opponent’s coalition; steal all its tokens.</div>
            <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.players || []).filter((p) => String(p.id) !== String(playerID)).map((p) => (
                <div key={p.id}>
                  <div className="text-amber-200/70 text-[11px] font-mono font-black tracking-widest">{p.name}</div>
                  <div className="mt-2 flex gap-3 flex-wrap">
                    {(p.coalition || []).filter((c) => c.type === 'persona' && !c.shielded && Array.isArray(c.tags) && c.tags.includes('faction:liberal')).map((c) => (
                      <button
                        key={c.id}
                        className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                        onClick={() => moves.persona5PickLiberal(String(p.id), c.id)}
                        title={c.name || c.id}
                      >
                        <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Persona_14 discard prompt (active player chooses any coalition persona) */}
      {G.pending?.kind === 'discard_one_persona_from_any_coalition' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Discard a persona</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose any persona from any coalition (including yours) to discard.</div>
            <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.players || []).map((p) => (
                <div key={p.id} className="">
                  <div className="text-amber-200/70 text-[11px] font-mono font-black tracking-widest">{p.name}</div>
                  <div className="mt-2 flex gap-3 flex-wrap">
                    {(p.coalition || []).filter((c) => c.type === 'persona' && !c.shielded && !isImmovablePersona(c)).map((c) => (
                      <button
                        key={c.id}
                        className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                        onClick={() => moves.discardPersonaFromCoalition(String(p.id), c.id)}
                        title={c.name || c.id}
                      >
                        <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Persona_45: choose opponent (no modal) */}
      {pendingPersona45 && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            {pendingPersona45Source}: click an opponent to steal 1 random card
          </div>
        </div>
      )}

      {canPersona8Swap && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            persona_8: click the just-played persona to SWAP with it
          </div>
        </div>
      )}

      {canPersona10Cancel && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            persona_10: click Naki in your hand to cancel this effect
          </div>
        </div>
      )}

      {/* Event_16: discard one of YOUR personas, then draw 1 (no modal) */}
      {G.pending?.kind === 'event_16_discard_self_persona_then_draw1' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            EVENT {G.pending.sourceCardId}: click a persona in YOUR coalition to discard it (then draw 1)
          </div>
        </div>
      )}

      {/* Action_7: pick any persona to block abilities & clear tokens */}
      {G.pending?.kind === 'action_7_block_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 7 — Block persona</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose any persona in play. That persona&apos;s abilities are blocked and its VP tokens are cleared.</div>
            <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.players || []).map((p) => (
                <div key={p.id} className="">
                  <div className="text-amber-200/70 text-[11px] font-mono font-black tracking-widest">{p.name}</div>
                  <div className="mt-2 flex gap-3 flex-wrap">
                    {(p.coalition || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).map((c) => (
                      <button
                        key={c.id}
                        className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                        onClick={() => moves.blockPersonaForAction7(String(p.id), c.id)}
                        title={c.name || c.id}
                      >
                        <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action_13: shield one of YOUR personas */}
      {G.pending?.kind === 'action_13_shield_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[700px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 13 — Shield</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose one of your personas to shield. It can&apos;t be targeted by actions/abilities, and +1 gains are reduced by 1.</div>
            <div className="mt-4 flex gap-3 flex-wrap">
              {(me?.coalition || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.shieldPersonaForAction13(c.id)}
                  title={c.name || c.id}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action_17: choose opponent persona to receive -1 tokens */}
      {G.pending?.kind === 'action_17_choose_opponent_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 17 — Apply -1 tokens</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose an opponent persona. It gets 2 × -1 tokens (or 4 × -1 if it is persona_3, persona_38, persona_41 or persona_43).</div>
            <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.players || []).filter((p) => String(p.id) !== String(playerID)).map((p) => (
                <div key={p.id} className="">
                  <div className="text-amber-200/70 text-[11px] font-mono font-black tracking-widest">{p.name}</div>
                  <div className="mt-2 flex gap-3 flex-wrap">
                    {(p.coalition || []).filter((c) => c.type === 'persona' && !c.shielded && !isImmovablePersona(c)).map((c) => (
                      <button
                        key={c.id}
                        className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                        onClick={() => moves.applyAction17ToPersona(c.id)}
                        title={c.name || c.id}
                      >
                        <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action_18: return persona from discard to hand */}
      {G.pending?.kind === 'action_18_pick_persona_from_discard' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm backdrop-filter pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 18 — Return from discard</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose a persona from the discard pile to return to your hand.</div>
            <div className="mt-4 flex flex-wrap gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.discard || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.pickPersonaFromDiscardForAction18(c.id)}
                  title={c.name || c.id}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
              {!(G.discard || []).some((c) => c.type === 'persona' && !isImmovablePersona(c)) && (
                <div className="text-amber-200/70 text-sm">No personas in discard.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persona_20: take any card from discard to hand */}
      {G.pending?.kind === 'persona_20_pick_from_discard' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm backdrop-filter pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Bykov (p20) — Take from discard</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose any 1 card from the discard pile to take into your hand.</div>
            <div className="mt-4 flex flex-wrap gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.discard || []).map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.persona20PickFromDiscard(c.id)}
                  title={c.name || c.id}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
              {!(G.discard || []).length && (
                <div className="text-amber-200/70 text-sm">No cards in discard.</div>
              )}
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
              // Use the same ordering for legend + chart: sort by final score DESC.
              const colors = ['#f59e0b', '#22c55e', '#60a5fa', '#f472b6', '#a78bfa'];
              const scoreNow = (pid) => {
                const p = (G.players || []).find((pp) => String(pp.id) === String(pid));
                return (p?.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0);
              };
              const playerIds = (G.players || []).map((p) => String(p.id)).sort((a, b) => scoreNow(b) - scoreNow(a));

              return (
                <>
                  <div className="mt-4 text-amber-100/80 text-sm font-mono whitespace-pre">
                    {playerIds.map((pid, i) => {
                      const p = (G.players || []).find((pp) => String(pp.id) === String(pid));
                      const pts = scoreNow(pid);
                      const col = colors[i % colors.length];
                      return (
                        <div key={pid} style={{ color: col }}>
                          {p?.name || pid}: {pts} vp (coalition {(p?.coalition || []).length || 0})
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
      {ENABLE_EVENT_SPLASH && showEventSplash && !!G.lastEvent && (
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
      {ENABLE_ACTION_SPLASH && showActionSplash && !!G.lastAction && (
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
                  <button
                    type="button"
                    onClick={() => {
                      setSoundOn((v) => {
                        const nv = !v;
                        try { localStorage.setItem('politikum:soundOn', nv ? '1' : '0'); } catch {}
                        return nv;
                      });
                      playSfx('ui', 0.4);
                    }}
                    className={("px-2 py-0.5 rounded-md border text-[10px] font-black transition-colors " + (soundOn ? "bg-emerald-600/30 border-emerald-500/40 text-emerald-100" : "bg-black/20 border-amber-900/20 text-amber-200/70 hover:text-amber-200"))}
                    title="Sound (M)"
                  >
                    M
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
                // smoother: use card center thresholds instead of rounding
                const idx = Math.max(0, Math.min(coal.length - 1, Math.floor((x + step / 2) / step)));
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

                const pendingEvent16 = pending?.kind === 'event_16_discard_self_persona_then_draw1' && String(pending?.playerId) === String(playerID);
                const pendingP21Here = pendingP21;
                const pendingP26Here = pendingP26;
                const pendingP28Here = pendingP28;
                const pendingP32Here = pendingP32;
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={
                      "absolute bottom-0 w-40 aspect-[2/3] rounded-2xl overflow-hidden border-2 shadow-2xl transition-colors " +
                      (placementMode || pendingTokens || pendingEvent16 || pendingP21Here || pendingP26Here || pendingP28Here || pendingP32Here ? "border-emerald-400/50 hover:border-emerald-300 cursor-pointer" : "border-black/40 cursor-default")
                    }
                    style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: 'bottom center' }}
                    title={c.id}
                    onClick={() => {
                      if (placementMode) {
                        // If click is on far-left or far-right card, treat as placement side.
                        if (i === 0) {
                          try { playSfx('play'); moves.playPersona(placementMode.cardId, c.id, 'left'); } catch {}
                          setPlacementMode(null);
                          return;
                        }
                        if (i === (coal.length - 1)) {
                          try { playSfx('play'); moves.playPersona(placementMode.cardId, c.id, 'right'); } catch {}
                          setPlacementMode(null);
                          return;
                        }
                        setPlacementMode((m) => ({ ...(m || {}), neighborId: c.id }));
                        return;
                      }
                      if (pendingEvent16) {
                        try { moves.discardPersonaFromOwnCoalitionForEvent16(c.id); } catch {}
                        return;
                      }
                      if (pendingP21Here) {
                        try { moves.persona21InvertTokens(String(playerID), c.id); } catch {}
                        return;
                      }
                      if (pendingP26Here) {
                        // Can't pick red nationalist from own coalition usually, but allow.
                        try { moves.persona26PurgeRedNationalist(String(playerID), c.id); } catch {}
                        return;
                      }
                      if (pendingP28Here) {
                        try { moves.persona28StealPlusTokens(String(playerID), c.id, 3); } catch {}
                        return;
                      }
                      if (pendingP32Here) {
                        try { moves.persona32BounceToHand(c.id); } catch {}
                        return;
                      }
                      if (!pendingTokens) return;
                      try { moves.applyPendingToken(c.id); } catch {}
                    }}
                  >
                    <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                    {(Number(c.vpDelta || 0) !== 0) && (
                      <div className={
                        "absolute left-2 bottom-2 w-8 h-8 rounded-full border flex items-center justify-center text-white font-black text-[14px] " +
                        (Number(c.vpDelta || 0) < 0 ? "bg-red-700/90 border-red-200/30" : "bg-emerald-700/90 border-emerald-200/30")
                      }>
                        {c.vpDelta}
                      </div>
                    )}
                    {(c.shielded || c.blockedAbilities) && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-1 text-[9px] font-mono font-black">
                        {c.shielded && (
                          <span className="px-1.5 py-0.5 rounded-full bg-sky-700/90 border border-sky-300/40 text-sky-50 shadow-md">SH</span>
                        )}
                        {c.blockedAbilities && (
                          <span className="px-1.5 py-0.5 rounded-full bg-red-800/90 border border-red-300/40 text-red-50 shadow-md">X</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Placement mode prompt */}
      {!!placementMode && (
        <div className="fixed inset-0 z-[3200] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/55 border border-amber-900/20 rounded-2xl px-5 py-4 backdrop-blur-sm shadow-2xl">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Place persona</div>
            <div className="mt-2 text-amber-100/85 text-sm font-mono whitespace-pre">
              {`Pick a neighbor in your coalition, then choose side.`}
            </div>
            <div className="mt-3 flex gap-2 pointer-events-auto">
              <button
                type="button"
                className="px-3 py-1 rounded-full bg-black/60 border border-amber-900/20 text-amber-100/90 font-mono font-black text-[12px] hover:bg-black/70"
                onClick={() => {
                  if (!placementMode?.neighborId) return;
                  try { playSfx('play'); moves.playPersona(placementMode.cardId, placementMode.neighborId, 'left'); } catch {}
                  setPlacementMode(null);
                }}
                disabled={!placementMode?.neighborId}
                title="Place to the LEFT of selected card"
              >
                LEFT
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded-full bg-black/60 border border-amber-900/20 text-amber-100/90 font-mono font-black text-[12px] hover:bg-black/70"
                onClick={() => {
                  if (!placementMode?.neighborId) return;
                  try { playSfx('play'); moves.playPersona(placementMode.cardId, placementMode.neighborId, 'right'); } catch {}
                  setPlacementMode(null);
                }}
                disabled={!placementMode?.neighborId}
                title="Place to the RIGHT of selected card"
              >
                RIGHT
              </button>
              <button
                type="button"
                className="ml-auto px-3 py-1 rounded-full bg-black/40 border border-amber-900/20 text-amber-200/70 font-mono font-black text-[12px] hover:bg-black/60"
                onClick={() => setPlacementMode(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!!placementModeOpp && (
        <div className="fixed inset-0 z-[3200] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/55 border border-amber-900/20 rounded-2xl px-5 py-4 backdrop-blur-sm shadow-2xl">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Place persona into opponent</div>
            <div className="mt-2 text-amber-100/85 text-sm font-mono whitespace-pre">
              {`Click a persona in their coalition, then choose side.`}
            </div>
            <div className="mt-3 flex gap-2 pointer-events-auto">
              <button
                type="button"
                className="px-3 py-1 rounded-full bg-black/60 border border-amber-900/20 text-amber-100/90 font-mono font-black text-[12px] hover:bg-black/70"
                onClick={() => {
                  if (!placementModeOpp?.neighborId) return;
                  try { playSfx('play'); moves.playPersona(placementModeOpp.cardId, placementModeOpp.neighborId, 'left', placementModeOpp.targetId); } catch {}
                  setPlacementModeOpp(null);
                }}
                disabled={!placementModeOpp?.neighborId}
                title="Place to the LEFT of selected card"
              >
                LEFT
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded-full bg-black/60 border border-amber-900/20 text-amber-100/90 font-mono font-black text-[12px] hover:bg-black/70"
                onClick={() => {
                  if (!placementModeOpp?.neighborId) return;
                  try { playSfx('play'); moves.playPersona(placementModeOpp.cardId, placementModeOpp.neighborId, 'right', placementModeOpp.targetId); } catch {}
                  setPlacementModeOpp(null);
                }}
                disabled={!placementModeOpp?.neighborId}
                title="Place to the RIGHT of selected card"
              >
                RIGHT
              </button>
              <button
                type="button"
                className="ml-auto px-3 py-1 rounded-full bg-black/40 border border-amber-900/20 text-amber-200/70 font-mono font-black text-[12px] hover:bg-black/60"
                onClick={() => setPlacementModeOpp(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Total VP (bottom-right) */}
      <div className="fixed bottom-4 right-4 z-[2500] pointer-events-none select-none">
        <div className="bg-black/60 border border-amber-900/20 rounded-full px-4 py-2 text-amber-100/90 font-mono font-black tracking-widest text-[14px]">
          VP: {myCoalitionPoints}
        </div>
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

            const canPlayPersona = isMyTurn && !responseActive && G.hasDrawn && card.type === 'persona';
            const canPlayAction = isMyTurn && !responseActive && G.hasDrawn && !G.hasPlayed && card.type === 'action';

            // out-of-turn cancels
            // Allow clicking cancels as long as server is advertising a response window.
            // Server enforces actual expiry; UI shouldn't block.
            const canCancelAction = responseKind === 'cancel_action' && card.type === 'action' && baseId === 'action_6' && String(response.playedBy) !== String(playerID);
            const canCancelPersona = responseKind === 'cancel_persona' && card.type === 'action' && baseId === 'action_8' && String(response.playedBy) !== String(playerID);
            const canCancelWithPersona10 = canPersona10Cancel && card.type === 'persona' && baseId === 'persona_10';

            const baseIs14 = baseId === 'action_14';
            const canCancelEffectOnMe = responseKind === 'cancel_action' && responseTargetsMe && baseIs14;

            const canClick = canPlayPersona || canPlayAction || canCancelAction || canCancelPersona || canCancelEffectOnMe || canCancelWithPersona10;

            return (
              <button
                key={card.id}
                onClick={(e) => {
                  if (!canClick) return;
                  if (canPlayPersona) {
                    const haveCoal = (me?.coalition || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).length >= 1;

                    // persona_9: must choose opponent receiver
                    if (baseId === 'persona_9') {
                      playSfx('ui', 0.35);
                      setPickTargetForPersona9({ cardId: card.id });
                      return;
                    }

                    // Placement mode should be explicit (Shift+click), not every click.
                    if (haveCoal && e?.shiftKey) {
                      playSfx('ui', 0.35);
                      setPlacementMode({ cardId: card.id, neighborId: null, side: 'right' });
                      return;
                    }
                    playSfx('play');
                    moves.playPersona(card.id);
                  }
                  else if (canPlayAction) {
                    if (baseId === 'action_4') { playSfx('ui', 0.35); setPickTargetForAction4({ cardId: card.id }); return; }
                    if (baseId === 'action_9') { playSfx('ui', 0.35); setPickTargetForAction9({ cardId: card.id }); return; }
                    playSfx('play');
                    moves.playAction(card.id);
                  } else if (canCancelAction || canCancelPersona || canCancelEffectOnMe) {
                    playSfx('ui', 0.35);
                    moves.playAction(card.id);
                  } else if (canCancelWithPersona10) {
                    playSfx('ui', 0.35);
                    moves.persona10CancelFromHand(card.id);
                  }
                }}
                aria-disabled={!canClick}
                className={
                  'absolute bottom-0 w-36 aspect-[2/3] rounded-2xl border-2 transition-all duration-200 ease-out shadow-xl overflow-visible ' +
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
                <div className="w-full h-full rounded-2xl overflow-hidden">
                  <img src={card.img} alt={card.id} className="w-full h-full object-cover" draggable={false} />
                </div>
                {showHotkeys && (
                  <div className="absolute left-2 -top-8 px-2 py-1 rounded-full bg-black/65 border border-amber-900/30 text-amber-100 font-mono font-black text-[11px]">
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
