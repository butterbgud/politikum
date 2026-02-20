
// Bot AI Logic for Citadel
// Returns true if an action was taken, false if waiting/done.

export function runBotTurn(state, dispatch) {
  const me = state.players.find(p => p.id === state.currentPlayerId);

  // BOT_FAILSAFE_TRY
  try {

  const calcBotPoints = (pl) => {
    const city = pl.city || [];
    let score = city.reduce((sum, c) => sum + (c.cost || 0), 0);
    const colors = new Set(city.map(c => c.color).filter(Boolean));
    const hasAllColorsRaw = colors.size >= 5;
    const has = (name) => city.some(c => c.name === name);
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

  const destroyCost = (targetPlayer, card) => {
    const hasGreatWall = (targetPlayer.city || []).some(c => c.name === 'Great Wall');
    return Math.max(0, (card.cost || 0) - 1) + (hasGreatWall ? 1 : 0);
  };

  if (!me || !me.isBot) return false;

  // --- DRAFT PHASE ---
  if (state.phase === 'draft') {
    if (me.role !== null) return false;
    const roles = state.availableRoles || [];
    if (!roles.length) return false;

    // 1. Simple Heuristic:
    // - If have > 4 gold, maybe Architect (7) or Merchant (6) to build fast?
    // - If hand empty, Magician (3) or Architect (7)?
    // - If city big (>=6), maybe Warlord (8) to attack leader or Bishop (5) for protection?
    // - If many noble/trade/religious/military cards, pick matching role (King/Merchant/Bishop/Warlord).
    
    // For now, let's keep it semi-random but weighted?
    // Or just random for MVP but better structure for future expansion.
    // Let's implement: Color Preference.
    
    let bestRole = roles[0];
    let maxScore = -1;

    roles.forEach(r => {
        let score = Math.random() * 2; // Baseline randomness
        
        // Color Synergy
        if (r.id === 4) score += me.city.filter(c => c.color === 'noble').length; // Queen
        if (r.id === 5) score += me.city.filter(c => c.color === 'religious').length; // Bishop
        if (r.id === 6) score += me.city.filter(c => c.color === 'trade').length; // Merchant
        if (r.id === 8) score += me.city.filter(c => c.color === 'military').length; // Warlord

        // Strategic Needs
        if (r.id === 7 && me.hand.length < 2) score += 2; // Architect needs cards?
        if (r.id === 6 && me.gold < 2) score += 2; // Merchant needs gold
        if (r.id === 3 && me.hand.length === 0) score += 3; // Magician empty hand swap

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
    
    // 1. Handle Interaction (Assassin/Thief/Warlord/Magician Modals)
    if (state.interaction) {
        // ASSASSIN
        if (state.interaction.type === 'ASSASSINATE') {
            const options0 = state.interaction.options || [];
            if (!options0.length) return false;

            // Early-game heuristic: Assassin should almost never target Thief.
            // (No strategic benefit early; better to hit economy/build-limit roles.)
            const early = (state.turn ?? 0) < 5;
            const options = (early && options0.length > 1) ? options0.filter(id => id !== 2) : options0;

            // Prefer high-impact roles when present.
            // Order: Merchant(6), Architect(7), Queen(4), Bishop(5), Warlord(8), Magician(3), Thief(2)
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
             const options = state.interaction.options;
             // Don't steal from Assassin or killed chars if known?
             // Logic: Steal from whoever usually has gold (Merchant/Architect).
             // Options are IDs [3,4,5,6,7,8] filtered by killed/Assassin.
             // Prefer Architect (7) or Merchant (6) if available.
             const preferred = [6, 7, 4, 5, 8, 3];
             let target = options[0];
             for (let p of preferred) {
                 if (options.includes(p)) {
                     target = p;
                     break;
                 }
             }
             if (!target) target = options[Math.floor(Math.random() * options.length)];
             dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'STEAL', target } });
             return true;
        }

        // WARLORD
        if (state.interaction.type === 'DESTROY') {
            // Options: { playerId, cardId }
            const options = state.interaction.options || [];

            // Build detailed target list with real cost (Great Wall) and legality guards (Keep, completed city)
            const detailed = options.map(opt => {
                const pl = state.players.find(pp => pp.id === opt.playerId);
                const card = pl?.city?.find(cc => cc.id === opt.cardId);
                if (!pl || !card) return null;
                const cost = destroyCost(pl, card);
                const blockedByKeep = card.name === 'Keep';
                const blockedByCompleteCity = (pl.city?.length || 0) >= 8;
                const affordable = (me.gold || 0) >= cost;
                return { playerId: opt.playerId, cardId: opt.cardId, cost, affordable, blockedByKeep, blockedByCompleteCity, blockedByBishop: (pl?.role?.id === 5), points: calcBotPoints(pl), cardCost: card.cost || 0 };
            }).filter(Boolean);

            const valid = detailed.filter(x => x.affordable && !x.blockedByKeep && !x.blockedByCompleteCity && !x.blockedByBishop);
            if (!valid.length) {
                 dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
                 return true;
            }

            // Prefer free destroys
            const free = valid.filter(x => x.cost === 0);
            const pool = free.length ? free : valid;

            // Prefer hitting the current points leader
            const maxPts = Math.max(...pool.map(x => x.points));
            const leaders = pool.filter(x => x.points === maxPts);

            // Within leader, prefer higher card cost (hurts more) but still affordable
            leaders.sort((a,b) => (b.cardCost - a.cardCost) || (a.cost - b.cost));
            const choice = leaders[0];

            dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'DESTROY', playerId: choice.playerId, cardId: choice.cardId } });
            return true;
        }
        
        // MAGICIAN
        if (state.interaction.type === 'MAGIC') {
            const options = state.interaction.options || [];
            const others = state.players.filter(p => p.id !== me.id);
            const mostCardsPlayer = [...others].sort((a,b) => (b.hand?.length||0) - (a.hand?.length||0))[0];

            if (options.includes('SWAP_PLAYER') && me.hand.length < 2 && (mostCardsPlayer?.hand?.length || 0) > 2) {
                 dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'MAGIC', target: 'SWAP_PLAYER' } });
                 return true;
            }

            if (options.includes('SWAP_DECK') && me.hand.length < 2) {
                 dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'MAGIC', target: 'SWAP_DECK' } });
                 return true;
            }

            dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
            return true;
        }
        // MAGICIAN: choose which player to swap with
        if (state.interaction.type === 'MAGIC_SWAP_PLAYER') {
            const options = state.interaction.options || [];
            if (!options.length) {
                dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
                return true;
            }
            // Prefer swapping with player with most cards (>=3)
            let best = options[0];
            let bestCount = -1;
            for (const pid of options) {
                const pl = state.players.find(p => p.id === pid);
                const n = (pl?.hand || []).length;
                if (n > bestCount) {
                    bestCount = n;
                    best = pid;
                }
            }
            dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'MAGIC_SWAP_PLAYER', target: best } });
            return true;
        }


        // Cancel unknown interactions to prevent lock
        dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
        return true;
    }

    // 2. Resource Gathering (Gold vs Cards)
    // Only if hasn't taken action
    if (!me.hasTakenIncomeThisTurn) {
        // If holding drawing state
        if (state.isDrawing && state.drawnCards?.length) {
            // Pick the most expensive card? Or one that matches build capabilities?
            // Heuristic: Pick expensive (points)
            const sorted = [...state.drawnCards].sort((a,b) => b.cost - a.cost);
            dispatch({ type: 'KEEP_CARD', payload: { cardId: sorted[0].id } });
            return true;
        }

        // Decide: Gold or Draw?
        // If gold < 2 -> Gold (almost always needed)
        // If hand empty -> Draw
        // If have buildable card but need gold -> Gold
        // If have gold > 4 and hand < 2 -> Draw
        
        const buildable = me.hand.filter(c => c.cost <= me.gold);
        
        if (me.gold < 2) {
             dispatch({ type: 'TAKE_GOLD' });
             return true;
        }
        if (me.hand.length === 0) {
             dispatch({ type: 'DRAW_CARDS_START' });
             return true;
        }
        if (buildable.length > 0 && me.gold < 4) {
             // We can build, but maybe we want more gold for later?
             // Actually if we can build, we should probably just take gold to build *better* things or multiple?
             // No, if we can build, we enter build phase (after resource).
             // If we have a GOOD card we can't afford, take gold.
             const unbuildable = me.hand.filter(c => c.cost > me.gold);
             if (unbuildable.length > 0) {
                 dispatch({ type: 'TAKE_GOLD' });
                 return true;
             }
        }
        
        // Default: 60% Gold, 40% Draw
        if (Math.random() > 0.4) dispatch({ type: 'TAKE_GOLD' });
        else dispatch({ type: 'DRAW_CARDS_START' });
        return true;
    }

    // 3. Bot active abilities (use when beneficial)
    const roleId = state.currentRoleId;
    if ([1,2,3,8].includes(roleId) && !state.interaction && !me.abilityUsed) {
      // Assassin/Thief: always
      if (roleId === 1 || roleId === 2) {
        dispatch({ type: 'ACTIVATE_ABILITY' });
        return true;
      }
      // Warlord: always try
      if (roleId === 8) {
        dispatch({ type: 'ACTIVATE_ABILITY' });
        return true;
      }
      // Magician: if hand is small, try to improve
      if (roleId === 3 && (me.hand || []).length < 2) {
        dispatch({ type: 'ACTIVATE_ABILITY' });
        return true;
      }
    }

    // 4. Build Phase
    // Try to build as much as possible (Architect = 3, others = 1)
    const buildLimit = me.buildLimit || 1;
    const builtThisTurn = me.builtThisTurn || 0;
    
    if (builtThisTurn < buildLimit && me.hand.length > 0) {
        // Find affordable cards
        // Filter out duplicates (already in city)
        const cityNames = (me.city || []).map(c => c.name);
        const uniqueAffordable = me.hand
            .filter(c => c.cost <= me.gold)
            .filter(c => !cityNames.includes(c.name));

        if (uniqueAffordable.length > 0) {
            // Sort by cost descending (points!)
            uniqueAffordable.sort((a,b) => b.cost - a.cost);
            
            dispatch({ type: 'BUILD_DISTRICT', payload: { cardId: uniqueAffordable[0].id } });
            return true;
        }
    }
    
    // 5. End Turn
    dispatch({ type: 'END_TURN' });
    return true;
  }

  return false;
  } catch (e) {
    try {
      // If bot logic throws, fail safe: cancel any interaction/draw and end the turn to avoid softlocks.
      if (state?.interaction) dispatch({ type: 'RESOLVE_INTERACTION', payload: { type: 'CANCEL' } });
      if (state?.isDrawing) dispatch({ type: 'CANCEL_DRAW' });
      if (state?.phase === 'action') dispatch({ type: 'END_TURN' });
    } catch {}
    return true;
  }

}
