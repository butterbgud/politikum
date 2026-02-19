// Bot AI logic (ported from citadel-sp/src/botLogic.js)
// Intentionally loose typing for now: engine consumers pass a SP-like boardState
// ({ phase, players, availableRoles, interaction, ... }) + a dispatch(action) fn.

export type BotDispatch = (action: { type: string; payload?: any }) => void;

export function runBotTurn(state: any, dispatch: BotDispatch): boolean {
  const me = (state.players || []).find((p: any) => p.id === state.currentPlayerId);

  // BOT_FAILSAFE_TRY
  try {
    const calcBotPoints = (pl: any) => {
      const city = pl.city || [];
      let score = city.reduce((sum: number, c: any) => sum + (c.cost || 0), 0);
      const colors = new Set(city.map((c: any) => c.color).filter(Boolean));
      const hasAllColorsRaw = colors.size >= 5;
      const has = (name: string) => city.some((c: any) => c.name === name);
      const hasAllColors = hasAllColorsRaw || (!hasAllColorsRaw && has('Haunted Quarter'));
      if (hasAllColors) score += 3;
      if (pl.firstBuilderBonus) score += 4;
      else if ((city.length || 0) >= 8) score += 2;
      if (has('University')) score += 2;
      if (has('Dragon Gate')) score += 2;
      if (has('Imperial Treasury')) score += (pl.gold || 0);
      if (has('Map Room')) score += ((pl.hand || []).length);
      return score;
    };

    const destroyCost = (targetPlayer: any, card: any) => {
      const hasGreatWall = (targetPlayer.city || []).some((c: any) => c.name === 'Great Wall');
      return Math.max(0, (card.cost || 0) - 1) + (hasGreatWall ? 1 : 0);
    };

    if (!me || !me.isBot) return false;

    // --- DRAFT PHASE ---
    if (state.phase === 'draft') {
      const roles = state.availableRoles || [];
      if (!roles.length) return false;

      let bestRole = roles[0];
      let maxScore = -1;

      roles.forEach((r: any) => {
        let score = Math.random() * 2;

        if (r.id === 4) score += (me.city || []).filter((c: any) => c.color === 'noble').length;
        if (r.id === 5) score += (me.city || []).filter((c: any) => c.color === 'religious').length;
        if (r.id === 6) score += (me.city || []).filter((c: any) => c.color === 'trade').length;
        if (r.id === 8) score += (me.city || []).filter((c: any) => c.color === 'military').length;

        if (r.id === 7 && (me.hand || []).length < 2) score += 2;
        if (r.id === 6 && (me.gold || 0) < 2) score += 2;
        if (r.id === 3 && (me.hand || []).length === 0) score += 3;

        if (score > maxScore) {
          maxScore = score;
          bestRole = r;
        }
      });

      dispatch({ type: 'PICK_ROLE', payload: { playerId: state.currentPlayerId, roleId: bestRole.id } });
      return true;
    }

    // --- ACTION PHASE ---
    if (state.phase === 'action') {
      // 1) Handle interaction modals
      if (state.interaction) {
        // ASSASSIN
        if (state.interaction.type === 'ASSASSINATE') {
          const options0 = state.interaction.options || [];
          if (!options0.length) return false;

          const early = (state.turn ?? 0) < 5;
          const options = (early && options0.length > 1) ? options0.filter((id: number) => id !== 2) : options0;

          const preferred = [6, 7, 4, 5, 8, 3, 2];
          let target = options[0];
          for (const p of preferred) {
            if (options.includes(p)) { target = p; break; }
          }
          if (!target) target = options[Math.floor(Math.random() * options.length)];

          dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'ASSASSINATE', target } });
          return true;
        }

        // THIEF
        if (state.interaction.type === 'STEAL') {
          const options = state.interaction.options || [];
          if (!options.length) return false;
          const preferred = [6, 7, 4, 5, 8, 3];
          let target = options[0];
          for (const p of preferred) {
            if (options.includes(p)) { target = p; break; }
          }
          if (!target) target = options[Math.floor(Math.random() * options.length)];
          dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'STEAL', target } });
          return true;
        }

        // WARLORD
        if (state.interaction.type === 'DESTROY') {
          const options = state.interaction.options || [];

          const detailed = options.map((opt: any) => {
            const pl = (state.players || []).find((pp: any) => pp.id === opt.playerId);
            const card = pl?.city?.find((cc: any) => cc.id === opt.cardId);
            if (!pl || !card) return null;
            const cost = destroyCost(pl, card);
            const blockedByKeep = card.name === 'Keep';
            const blockedByCompleteCity = (pl.city?.length || 0) >= 8;
            const affordable = (me.gold || 0) >= cost;
            return {
              playerId: opt.playerId,
              cardId: opt.cardId,
              cost,
              affordable,
              blockedByKeep,
              blockedByCompleteCity,
              blockedByBishop: (pl?.role?.id === 5),
              points: calcBotPoints(pl),
              cardCost: card.cost || 0,
            };
          }).filter(Boolean);

          const valid = detailed.filter((x: any) => x.affordable && !x.blockedByKeep && !x.blockedByCompleteCity && !x.blockedByBishop);
          if (!valid.length) {
            dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
            return true;
          }

          const free = valid.filter((x: any) => x.cost === 0);
          const pool = free.length ? free : valid;

          const maxPts = Math.max(...pool.map((x: any) => x.points));
          const leaders = pool.filter((x: any) => x.points === maxPts);
          leaders.sort((a: any, b: any) => (b.cardCost - a.cardCost) || (a.cost - b.cost));
          const choice = leaders[0];

          dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'DESTROY', playerId: choice.playerId, cardId: choice.cardId } });
          return true;
        }

        // MAGICIAN
        if (state.interaction.type === 'MAGIC') {
          const options = state.interaction.options || [];
          const others = (state.players || []).filter((p: any) => p.id !== me.id);
          const mostCardsPlayer = [...others].sort((a: any, b: any) => (b.hand?.length || 0) - (a.hand?.length || 0))[0];

          if (options.includes('SWAP_PLAYER') && (me.hand || []).length < 2 && (mostCardsPlayer?.hand?.length || 0) > 2) {
            dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'MAGIC', target: 'SWAP_PLAYER' } });
            return true;
          }
          if (options.includes('SWAP_DECK') && (me.hand || []).length < 2) {
            dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'MAGIC', target: 'SWAP_DECK' } });
            return true;
          }
          dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
          return true;
        }

        if (state.interaction.type === 'MAGIC_SWAP_PLAYER') {
          const options = state.interaction.options || [];
          if (!options.length) {
            dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
            return true;
          }
          let best = options[0];
          let bestCount = -1;
          for (const pid of options) {
            const pl = (state.players || []).find((p: any) => p.id === pid);
            const n = (pl?.hand || []).length;
            if (n > bestCount) { bestCount = n; best = pid; }
          }
          dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'MAGIC_SWAP_PLAYER', target: best } });
          return true;
        }

        if (state.interaction.type === 'MAGIC_SWAP_DECK') {
          const options = state.interaction.options || [];
          if (!options.length) {
            dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'MAGIC_SWAP_DECK', selectedIds: [] } });
            return true;
          }

          const hand = me.hand || [];
          const city = me.city || [];
          const builtNames = new Set(city.map((c: any) => c.name));

          const scored = hand
            .filter((c: any) => options.includes(c.id))
            .map((c: any) => {
              const alreadyBuilt = builtNames.has(c.name);
              const unbuildable = (c.cost || 0) > (me.gold || 0);
              let score = 0;
              if (alreadyBuilt) score += 5;
              if (unbuildable) score += 2;
              if ((c.cost || 0) <= 1) score += 1;
              score += Math.random() * 0.25;
              return { id: c.id, score };
            })
            .sort((a: any, b: any) => b.score - a.score);

          let selectedIds: any[] = [];
          if (options.length <= 2) {
            selectedIds = options.slice();
          } else {
            selectedIds = scored.filter((x: any) => x.score >= 2).map((x: any) => x.id);
            if (!selectedIds.length) selectedIds = [scored[0]?.id].filter(Boolean);
          }

          dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'MAGIC_SWAP_DECK', selectedIds } });
          return true;
        }

        dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
        return true;
      }

      // 2) Resource gathering
      if (!me.hasTakenAction) {
        if (state.isDrawing && state.drawnCards?.length) {
          const sorted = [...state.drawnCards].sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0));
          dispatch({ type: 'KEEP_CARD', payload: { cardId: sorted[0].id } });
          return true;
        }

        const cheapest = Math.min(...(me.hand || []).map((c: any) => c.cost || 99), 99);
        if ((me.gold || 0) >= cheapest) {
          dispatch({ type: 'DRAW_CARDS_START' });
        } else {
          dispatch({ type: 'TAKE_GOLD' });
        }
        return true;
      }

      // 3) Use uniques / ability
      if (!me.abilityUsed) {
        const hasSmithy = (me.city || []).some((c: any) => c.name === 'Smithy');
        const hasLab = (me.city || []).some((c: any) => c.name === 'Laboratory');
        if (hasSmithy && (me.gold || 0) >= 2) {
          dispatch({ type: 'USE_SMITHY' });
          return true;
        }
        if (hasLab && (me.hand || []).length > 0) {
          const card = (me.hand || [])[0];
          dispatch({ type: 'USE_LAB_START' });
          dispatch({ type: 'USE_LAB_DISCARD', payload: { cardId: card.id } });
          return true;
        }

        dispatch({ type: 'ACTIVATE_ABILITY' });
        return true;
      }

      // 4) Build something if possible
      const buildable = (me.hand || []).filter((c: any) => (me.gold || 0) >= (c.cost || 0) && !(me.city || []).some((b: any) => b.name === c.name));
      if (buildable.length && (me.builtThisTurn || 0) < (me.buildLimit || 1)) {
        buildable.sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0));
        dispatch({ type: 'BUILD_DISTRICT', payload: { cardId: buildable[0].id } });
        return true;
      }

      // 5) End turn
      dispatch({ type: 'END_TURN' });
      return true;
    }

    return false;
  } catch (e) {
    try { dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } }); } catch {}
    try { dispatch({ type: 'END_TURN' }); } catch {}
    return true;
  }
}
