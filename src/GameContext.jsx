import React, { createContext, useContext, useReducer } from 'react';

// Initial State
const initialState = {
  phase: 'lobby', // lobby, draft, action, build, end
  turn: 0,
  currentPlayerId: null,
  kingId: null,
  players: [], // { id, name, gold, hand: [], city: [], role: null }
  deck: [
    { id: 101, name: 'Manor', cost: 3, color: 'noble', img: '/assets/buildings/manor2.jpg' },
    { id: 102, name: 'Castle', cost: 4, color: 'noble', img: '/assets/buildings/castle3.jpg' },
    { id: 103, name: 'Palace', cost: 5, color: 'noble', img: '/assets/buildings/palace2.jpg' },
    { id: 201, name: 'Tavern', cost: 1, color: 'trade', img: '/assets/buildings/tavern.jpg' },
    { id: 202, name: 'Market', cost: 2, color: 'trade', img: '/assets/buildings/market.jpg' },
    { id: 203, name: 'Docks', cost: 3, color: 'trade', img: '/assets/buildings/Docks.jpg' },
    { id: 204, name: 'Harbor', cost: 4, color: 'trade', img: '/assets/buildings/harbor.jpg' },
    { id: 205, name: 'Town Hall', cost: 5, color: 'trade', img: '/assets/buildings/town hall.jpg' },
    { id: 301, name: 'Temple', cost: 1, color: 'religious', img: '/assets/buildings/chapel2.jpg' }, // Using chapel asset
    { id: 302, name: 'Church', cost: 2, color: 'religious', img: '/assets/buildings/church2.jpg' },
    { id: 303, name: 'Monastery', cost: 3, color: 'religious', img: '/assets/buildings/monastery2.jpg' },
    { id: 304, name: 'Cathedral', cost: 5, color: 'religious', img: '/assets/buildings/cathedral4.jpg' },
    { id: 401, name: 'Watchtower', cost: 1, color: 'military', img: '/assets/buildings/watchtower2.jpg' },
    { id: 402, name: 'Prison', cost: 2, color: 'military', img: '/assets/buildings/prison3.jpg' },
    { id: 403, name: 'Barracks', cost: 3, color: 'military', img: '/assets/buildings/barracks2.jpg' },
    { id: 404, name: 'Fortress', cost: 5, color: 'military', img: '/assets/buildings/Fortress2.jpg' },
    { id: 501, name: 'Library', cost: 6, color: 'special', img: '/assets/buildings/library.jpg' },
    { id: 502, name: 'Smithy', cost: 5, color: 'special', img: '/assets/buildings/smithy2.jpg' },
    { id: 503, name: 'Observatory', cost: 5, color: 'special', img: '/assets/buildings/observatory.jpg' },
    { id: 504, name: 'Graveyard', cost: 5, color: 'special', img: '/assets/buildings/graveyard.jpg' },
    { id: 505, name: 'Laboratory', cost: 5, color: 'special', img: '/assets/buildings/Laboratory2.jpg' },
    { id: 506, name: 'Keep', cost: 3, color: 'special', img: '/assets/buildings/keep.jpg' },
    { id: 507, name: 'Haunted Quarter', cost: 2, color: 'special', img: '/assets/buildings/haunted quarter.jpg' },
    { id: 508, name: 'Great Wall', cost: 6, color: 'special', img: '/assets/buildings/great wall.jpg' },
    { id: 509, name: 'Magic School', cost: 6, color: 'special', img: '/assets/buildings/magic school.jpg' },
    { id: 510, name: 'Imperial Treasury', cost: 5, color: 'special', img: '/assets/buildings/imperial treasury.jpg' },
    { id: 511, name: 'Map Room', cost: 5, color: 'special', img: '/assets/buildings/map room.jpg' },
    { id: 512, name: 'University', cost: 6, color: 'special', img: '/assets/buildings/University.jpg' },
    { id: 513, name: 'Dragon Gate', cost: 6, color: 'special', img: '/assets/buildings/dragon gate.jpg' },
  ], // District cards
  drawnCards: [], // Temporary holding for cards drawn but not yet kept
  discardPile: [], // Destroyed districts etc (Graveyard)
  roles: [
    { id: 1, name: 'Assassin', img: '/assets/characters/assassin.jpg' },
    { id: 2, name: 'Thief', img: '/assets/characters/thief.jpg' },
    { id: 3, name: 'Magician', img: '/assets/characters/magician.jpg' },
    { id: 4, name: 'Queen', img: '/assets/characters/queen.jpg' }, // Using Queen asset for King slot for now
    { id: 5, name: 'Bishop', img: '/assets/characters/bishop.jpg' },
    { id: 6, name: 'Merchant', img: '/assets/characters/merchant.jpg' },
    { id: 7, name: 'Architect', img: '/assets/characters/architect.jpg' },
    { id: 8, name: 'Warlord', img: '/assets/characters/warlord.jpg' },
  ],
  log: []
};

export const MEDIEVAL_NAMES = [
  "Aethelred", "Baldwin", "Cedric", "Dunstan", "Eadric", "Florian", "Godfrey", "Hildegard",
  "Isolde", "Jocelyn", "Kenric", "Leofric", "Maldred", "Neville", "Osric", "Percival",
  "Quentin", "Rowena", "Sigismund", "Theobald", "Ulric", "Valerius", "Wilfred", "Xavier",
  "Yvaine", "Zephyr"
];

function getFaceUpDiscardCount(playerCount) {
  // Classic Citadels (8 characters)
  // 4 players: discard 2 faceup
  // 5 players: discard 1 faceup
  // 6-7 players: discard 0 faceup
  if (playerCount <= 4) return 2;
  if (playerCount === 5) return 1;
  return 0;
}

function removeCharactersForRound(roles, playerCount) {
  const deck = [...roles];
  const removedFaceUp = [];

  // Always discard 1 facedown (secret)
  const facedownIdx = Math.floor(Math.random() * deck.length);
  const removedFaceDown = deck.splice(facedownIdx, 1)[0];

  // Discard some faceup depending on player count.
  // Special rule: Queen (id=4) must not be among faceup discards.
  let toRemoveFaceUp = getFaceUpDiscardCount(playerCount);
  let guard = 200;
  while (toRemoveFaceUp > 0 && deck.length > 0 && guard > 0) {
    guard--;
    if (deck.length === 1 && deck[0].id === 4) break;

    const idx = Math.floor(Math.random() * deck.length);
    const card = deck[idx];
    if (card.id === 4) continue; // don't discard Queen faceup

    removedFaceUp.push(deck.splice(idx, 1)[0]);
    toRemoveFaceUp--;
  }

  return {
    availableRoles: deck,
    removedFaceUp,
    removedFaceDown,
  };
}


// ---- Unique (purple) building abilities ----
const UNIQUE_BUILDINGS = {
  SMITHY: 'Smithy',
  LAB: 'Laboratory',
  LIBRARY: 'Library',
  OBSERVATORY: 'Observatory',
  GRAVEYARD: 'Graveyard',
  KEEP: 'Keep',
  GREAT_WALL: 'Great Wall',
  HAUNTED_QUARTER: 'Haunted Quarter',
  IMPERIAL_TREASURY: 'Imperial Treasury',
  MAGIC_SCHOOL: 'Magic School',
  MAP_ROOM: 'Map Room',
  UNIVERSITY: 'University',
  DRAGON_GATE: 'Dragon Gate',
};

function hasUnique(player, name) {
  return (player.city || []).some(c => c.name === name);
}

function drawCountForDrawAction(player) {
  // Observatory: draw 3 instead of 2 when taking the Draw Cards action
  return hasUnique(player, UNIQUE_BUILDINGS.OBSERVATORY) ? 3 : 2;
}


// Reducer
function gameReducer(state, action) {
  switch (action.type) {
    case 'TAKE_GOLD':
        const pIndex = state.players.findIndex(p => p.id === state.currentPlayerId);
        const newPlayersGold = [...state.players];
        newPlayersGold[pIndex] = { 
            ...newPlayersGold[pIndex], 
            gold: newPlayersGold[pIndex].gold + 2,
            hasTakenAction: true 
        };
        return {
            ...state,
            players: newPlayersGold,
            log: [...state.log, `${newPlayersGold[pIndex].name} took 2 Gold.`]
        };

    case 'DRAW_CARDS_START': {
        const pIndex = state.players.findIndex(p => p.id === state.currentPlayerId);
        if (pIndex === -1) return state;
        const me = state.players[pIndex];

        const count = drawCountForDrawAction(me);
        const drawn = state.deck.slice(0, count);
        const remainingDeck = state.deck.slice(count);

        // Library: keep all drawn cards (no modal)
        if (hasUnique(me, UNIQUE_BUILDINGS.LIBRARY)) {
            const newPlayers = [...state.players];
            newPlayers[pIndex] = {
                ...me,
                hand: [...(me.hand || []), ...drawn],
                hasTakenAction: true,
            };
            return {
                ...state,
                deck: remainingDeck,
                players: newPlayers,
                drawnCards: [],
                isDrawing: false,
                log: [...state.log, `${me.name} drew ${drawn.length} cards (Library).`],
            };
        }

        // If deck is empty, avoid opening an empty modal that can soft-lock the UI
        if (drawn.length === 0) {
            const newPlayers = [...state.players];
            newPlayers[pIndex] = { ...me, hasTakenAction: true };
            return {
                ...state,
                players: newPlayers,
                deck: remainingDeck,
                drawnCards: [],
                isDrawing: false,
                log: [...state.log, `${me.name} tried to draw cards, but the deck is empty.`],
            };
        }

        return {
            ...state,
            deck: remainingDeck,
            drawnCards: drawn,
            isDrawing: true
        };
    }


    case 'CANCEL_DRAW': {
        // Put any drawn cards back to the bottom of the deck and close the modal.
        return {
            ...state,
            isDrawing: false,
            drawnCards: [],
            deck: [...state.deck, ...(state.drawnCards || [])],
        };
    }

    case 'KEEP_CARD':

        const { cardId } = action.payload;
        const keptCard = state.drawnCards.find(c => c.id === cardId);
        const rejectedCards = state.drawnCards.filter(c => c.id !== cardId);

        if (!keptCard) {
            return {
                ...state,
                isDrawing: false,
                drawnCards: [],
                deck: [...state.deck, ...rejectedCards],
            };
        }
        
        // Add kept to hand, discard rejected (discard pile not impl yet, effectively removed from game for now)
        const pIndexKeep = state.players.findIndex(p => p.id === state.currentPlayerId);
        const playersAfterKeep = [...state.players];
        playersAfterKeep[pIndexKeep] = {
            ...playersAfterKeep[pIndexKeep],
            hand: [...playersAfterKeep[pIndexKeep].hand, keptCard],
            hasTakenAction: true
        };

        return {
            ...state,
            players: playersAfterKeep,
            drawnCards: [],
            isDrawing: false,
            deck: [...state.deck, ...rejectedCards], // Put rejected at bottom of deck (Citadels rule: usually discard, but bottom for simplicity now)
            log: [...state.log, `${playersAfterKeep[pIndexKeep].name} drew a card.`]
        };

    case 'BUILD_DISTRICT':
        const { cardId: buildCardId } = action.payload;
        const playerIndexBuild = state.players.findIndex(p => p.id === state.currentPlayerId);
        const playerBuild = state.players[playerIndexBuild];
        const cardToBuild = playerBuild.hand.find(c => c.id === buildCardId);

        // No duplicates rule: cannot build two districts with the same name
        if (cardToBuild && playerBuild.city && playerBuild.city.some(c => c.name === cardToBuild.name)) {
            return {
                ...state,
                log: [...state.log, `${playerBuild.name} cannot build a duplicate district: ${cardToBuild.name}.`]
            };
        }


        // Validation (UI should prevent this, but safety check)
        if (!cardToBuild || playerBuild.gold < cardToBuild.cost) return state;

        // Execute Build
        const newHand = playerBuild.hand.filter(c => c.id !== buildCardId);
        const newCity = [...playerBuild.city, cardToBuild];
        
        const playersAfterBuild = [...state.players];
        playersAfterBuild[playerIndexBuild] = {
            ...playerBuild,
            gold: playerBuild.gold - cardToBuild.cost,
            hand: newHand,
            city: newCity,
            builtThisTurn: (playerBuild.builtThisTurn || 0) + 1
        };

        // Check for Game End Condition (City size >= 8)
        let isGameEnding = state.isGameEnding;
        let firstBuilderBonus = playerBuild.firstBuilderBonus || false;
        
        if (newCity.length >= 8 && !state.isGameEnding) {
             isGameEnding = true;
             firstBuilderBonus = true; // This player triggered it
             // Game continues until the end of the round, then ends.
        }

        const playersAfterBuildUpdate = [...playersAfterBuild];
        if (firstBuilderBonus) {
            playersAfterBuildUpdate[playerIndexBuild] = { ...playersAfterBuildUpdate[playerIndexBuild], firstBuilderBonus: true };
        }

        return {
            ...state,
            players: playersAfterBuildUpdate,
            isGameEnding: isGameEnding,
            log: [...state.log, `${playerBuild.name} built ${cardToBuild.name} for ${cardToBuild.cost} Gold.${firstBuilderBonus ? " THEY COMPLETED THEIR CITY!" : ""}`]
        };

    case 'END_GAME_SCORING':
        const scoredPlayers = state.players.map(p => {
            let score = 0;
            // 1. District Costs
            const districtScore = p.city.reduce((sum, c) => sum + c.cost, 0);
            score += districtScore;

            // 2. All 5 Colors Bonus (+3)
            const colors = new Set(p.city.map(c => c.color));
            const hasAllColors = colors.size >= 5;
            if (hasAllColors) score += 3;

            // 3. First Builder Bonus (+4)
            if (p.firstBuilderBonus) score += 4;

            // 4. Completed City Bonus (+2) (For anyone else who finished)
            // Note: The rule is +4 for the absolute first, +2 for anyone else who has 8+ districts.
            if (!p.firstBuilderBonus && p.city.length >= 8) score += 2;

            // 5. Unique (purple) endgame scoring
            const has = (name) => (p.city || []).some(c => c.name === name);
            if (has(UNIQUE_BUILDINGS.UNIVERSITY)) score += 2;
            if (has(UNIQUE_BUILDINGS.DRAGON_GATE)) score += 2;
            if (has(UNIQUE_BUILDINGS.IMPERIAL_TREASURY)) score += (p.gold || 0);
            if (has(UNIQUE_BUILDINGS.MAP_ROOM)) score += ((p.hand || []).length);

            // Haunted Quarter: can count as any color for 5-color bonus
            if (!hasAllColors && has(UNIQUE_BUILDINGS.HAUNTED_QUARTER)) {
                score += 3;
            }

            return { ...p, score, districtScore, hasAllColors: hasAllColors || (!hasAllColors && has(UNIQUE_BUILDINGS.HAUNTED_QUARTER)) };
        });

        // Sort by score descending
        scoredPlayers.sort((a, b) => b.score - a.score);

        return {
            ...state,
            phase: 'game_over',
            players: scoredPlayers,
            log: [...state.log, "Game Over! Scores calculated."]
        };

    case 'ACTIVATE_ABILITY':
        // Handle Assassin / Thief / Warlord / Magician interactions
        const abilityRoleId = state.currentRoleId;
        
        if (abilityRoleId === 1) { // Assassin
            return { ...state, interaction: { type: 'ASSASSINATE', options: [2,3,4,5,6,7,8] } };
        }
        if (abilityRoleId === 2) { // Thief
            return { ...state, interaction: { type: 'STEAL', options: [3,4,5,6,7,8].filter(id => !state.roles.find(r=>r.id===id).killed) } };
        }


        if (abilityRoleId === 8) { // Warlord
            // Flat list of destroy options: { playerId, cardId }
            const options = [];
            state.players.forEach(p => {
                const city = p.city || [];
                if (p.id === state.currentPlayerId) return; // no self-destruction for now
                if (city.length >= 8) return; // cannot destroy completed city
                // Bishop protection is checked on resolve (since roles are hidden until called)
                city.forEach(c => options.push({ playerId: p.id, cardId: c.id }));
            });

            return { ...state, interaction: { type: 'DESTROY', options } };
        }

        if (abilityRoleId === 3) { // Magician
            return { ...state, interaction: { type: 'MAGIC', options: ['SWAP_PLAYER', 'SWAP_DECK'] } };
        }
        
        return state;

    case 'RESOLVE_INTERACTION':
        const { type, target } = action.payload;

        if (type === 'GRAVEYARD_RECOVER') {
            const choice = action.payload.choice; // 'RECOVER' | 'SKIP'
            const victimId = action.payload.playerId;
            const cardId = action.payload.cardId;
            const victimIdx = state.players.findIndex(p => p.id === victimId);
            if (victimIdx === -1) return { ...state, interaction: null };
            const victim = state.players[victimIdx];
            const pile = state.discardPile || [];
            const card = pile.find(c => c.id === cardId);
            if (!card) return { ...state, interaction: null };

            if (choice === 'RECOVER' && (victim.gold || 0) >= 1 && hasUnique(victim, UNIQUE_BUILDINGS.GRAVEYARD)) {
                const newPlayers = [...state.players];
                newPlayers[victimIdx] = { ...victim, gold: (victim.gold || 0) - 1, hand: [...(victim.hand || []), card] };
                const newPile = pile.filter(c => c.id !== cardId);
                return {
                    ...state,
                    players: newPlayers,
                    discardPile: newPile,
                    interaction: null,
                    log: [...state.log, `${victim.name} paid 1 gold to recover ${card.name} (Graveyard).`]
                };
            }

            return {
                ...state,
                interaction: null,
                log: [...state.log, `${victim.name} did not recover the destroyed district.`]
            };
        }
        
        if (type === 'MAGIC') {
            // Magician: choose to swap hand with another player OR exchange with the deck
            if (target === 'SWAP_PLAYER') {
                const options = state.players.filter(p => p.id !== state.currentPlayerId).map(p => p.id);
                return { ...state, interaction: { type: 'MAGIC_SWAP_PLAYER', options } };
            }

            if (target === 'SWAP_DECK') {
                const pIdx = state.players.findIndex(p => p.id === state.currentPlayerId);
                if (pIdx === -1) return { ...state, interaction: null };
                const me = state.players[pIdx];

                const count = (me.hand || []).length;
                const drawn = state.deck.slice(0, count);
                const remainingDeck = state.deck.slice(count);

                const newPlayers = [...state.players];
                newPlayers[pIdx] = { ...me, hand: drawn, abilityUsed: true };

                return {
                    ...state,
                    players: newPlayers,
                    deck: [...remainingDeck, ...(me.hand || [])],
                    interaction: null,
                    log: [...state.log, `${me.name} used Magician to exchange with the deck (${count} cards).`],
                };
            }

            return { ...state, interaction: null };
        }

        if (type === 'MAGIC_SWAP_PLAYER') {
            const targetPlayerId = target;
            const pIdx = state.players.findIndex(p => p.id === state.currentPlayerId);
            const tIdx = state.players.findIndex(p => p.id === targetPlayerId);
            if (pIdx === -1 || tIdx === -1) return { ...state, interaction: null };

            const me = state.players[pIdx];
            const other = state.players[tIdx];
            const newPlayers = [...state.players];
            newPlayers[pIdx] = { ...me, hand: other.hand || [], abilityUsed: true };
            newPlayers[tIdx] = { ...other, hand: me.hand || [] };

            return {
                ...state,
                players: newPlayers,
                interaction: null,
                log: [...state.log, `${me.name} swapped hands with ${other.name} (Magician).`],
            };
        }

        if (type === 'ASSASSINATE') {
            const updatedRoles = state.roles.map(r => r.id === target ? { ...r, killed: true } : r);
            const pIdx = state.players.findIndex(p => p.id === state.currentPlayerId);
            const newPlayers = [...state.players];
            newPlayers[pIdx] = { ...newPlayers[pIdx], abilityUsed: true };
            return {
                ...state,
                players: newPlayers,
                roles: updatedRoles,
                interaction: null,
                log: [...state.log, `The Assassin has struck! (Target hidden until their turn)`]
            };
        }

        if (type === 'DESTROY') {
            const warlordIdx = state.players.findIndex(p => p.id === state.currentPlayerId);
            const warlord = state.players[warlordIdx];
            const targetPlayerId = action.payload.playerId;
            const targetCardId = action.payload.cardId;

            const targetIdx = state.players.findIndex(p => p.id === targetPlayerId);
            if (warlordIdx == -1 || targetIdx == -1) return { ...state, interaction: null };

            const targetPlayer = state.players[targetIdx];
            // Bishop protection: cannot destroy Bishop's districts
            if (targetPlayer.role && targetPlayer.role.id === 5) {
                return { ...state, interaction: null, log: [...state.log, `Warlord cannot destroy Bishop's districts.`] };
            }

            const targetCity = targetPlayer.city || [];
            if (targetCity.length >= 8) {
                return { ...state, interaction: null, log: [...state.log, `Cannot destroy a completed (8+) city.`] };
            }

            const card = targetCity.find(c => c.id === targetCardId);
            if (!card) return { ...state, interaction: null };

            // Keep cannot be destroyed
            if (card.name === UNIQUE_BUILDINGS.KEEP) {
                return { ...state, interaction: null, log: [...state.log, `The Keep cannot be destroyed.`] };
            }

            // Great Wall: +2 gold to destroy any district in that city
            const targetHasGreatWall = hasUnique(targetPlayer, UNIQUE_BUILDINGS.GREAT_WALL);
            const cost = Math.max(0, (card.cost || 0) - 1) + (targetHasGreatWall ? 1 : 0);
            if ((warlord.gold || 0) < cost) {
                return { ...state, interaction: null, log: [...state.log, `Not enough gold to destroy ${card.name}.`] };
            }

            const newPlayers = [...state.players];
            newPlayers[warlordIdx] = { ...warlord, gold: (warlord.gold || 0) - cost, abilityUsed: true };
            newPlayers[targetIdx] = { ...targetPlayer, city: targetCity.filter(c => c.id != targetCardId) };

            const newDiscard = [...(state.discardPile || []), card];

            // Graveyard: victim may pay 1 gold to recover destroyed district into hand
            const victimAfter = newPlayers[targetIdx];
            const victimHasGraveyard = hasUnique(victimAfter, UNIQUE_BUILDINGS.GRAVEYARD) && card.name !== UNIQUE_BUILDINGS.GRAVEYARD;
            const canRecover = victimHasGraveyard && (victimAfter.gold || 0) >= 1;

            if (canRecover) {
                return {
                    ...state,
                    players: newPlayers,
                    discardPile: newDiscard,
                    interaction: { type: 'GRAVEYARD_RECOVER', playerId: victimAfter.id, cardId: card.id },
                    log: [...state.log, `${warlord.name} destroyed ${targetPlayer.name}'s ${card.name} (paid ${cost}). Graveyard may recover it.`]
                };
            }

            return {
                ...state,
                players: newPlayers,
                discardPile: newDiscard,
                interaction: null,
                log: [...state.log, `${warlord.name} destroyed ${targetPlayer.name}'s ${card.name} (paid ${cost}).`]
            };
        }

        if (type === 'STEAL') {
            // Thief marks a role to be robbed. The robbery happens when that role reveals themselves.
            // Simplified: We mark the role now.
            const updatedRolesThief = state.roles.map(r => r.id === target ? { ...r, robbed: true } : r);
            const pIdx = state.players.findIndex(p => p.id === state.currentPlayerId);
            const newPlayers = [...state.players];
            newPlayers[pIdx] = { ...newPlayers[pIdx], abilityUsed: true };
            return {
                ...state,
                players: newPlayers,
                roles: updatedRolesThief,
                interaction: null,
                log: [...state.log, `The Thief has chosen a victim.`]
            };
        }

        return { ...state, interaction: null };

    case 'ADD_PLAYER':
      if (state.players.length >= 7) {
        return {
          ...state,
          log: [...state.log, "Cannot add more players. Max 7 reached."]
        };
      }
      return {
        ...state,
        players: [
          ...state.players,
          { 
            id: state.players.length + 1, 
            name: action.payload, 
            isBot: false,
            gold: 2, 
            hand: [], 
            city: [],
            role: null
          }
        ],
        log: [...state.log, `Player ${action.payload} joined.`]
      };
    case 'ADD_BOT': {
      if (state.players.length >= 7) {
        return {
          ...state,
          log: [...state.log, "Cannot add more bots. Max 7 reached."]
        };
      }
      const botNum = state.players.filter(p => p.isBot).length + 1;
      const botName = action.payload || MEDIEVAL_NAMES[Math.floor(Math.random() * MEDIEVAL_NAMES.length)];
      return {
        ...state,
        players: [
          ...state.players,
          {
            id: state.players.length + 1,
            name: botName,
            isBot: true,
            gold: 2,
            hand: [],
            city: [],
            role: null
          }
        ],
        log: [...state.log, `Bot ${botName} joined.`]
      };
    }

    case 'REMOVE_PLAYER':
      return {
        ...state,
        players: state.players.filter(p => p.id !== action.payload),
        log: [...state.log, `Player removed.`]
      };

    case 'START_GAME': {
      // Pick a Queen (P1 for now)
      const initialKingId = state.players[0].id;

      // Shuffle deck and deal 4 district cards to each player
      const deckShuffled = [...state.deck];
      for (let i = deckShuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deckShuffled[i], deckShuffled[j]] = [deckShuffled[j], deckShuffled[i]];
      }

      const playersDealt = state.players.map((p, idx) => {
        const start = idx * 4;
        const hand = deckShuffled.slice(start, start + 4);
        return { ...p, hand, city: p.city || [], role: null };
      });

      const remainingDeck = deckShuffled.slice(state.players.length * 4);

      const removed = removeCharactersForRound(state.roles, state.players.length);

      return {
        ...state,
        removedFaceUpRoles: removed.removedFaceUp,
        removedFaceDownRole: removed.removedFaceDown,
        players: playersDealt,
        deck: remainingDeck,
        phase: 'draft',
        kingId: initialKingId,
        currentPlayerId: initialKingId, // Queen picks first
        availableRoles: removed.availableRoles, // role deck minus removed cards
        log: [...state.log, 'Game started! Everyone received 4 district cards.', 'Removed characters: 1 facedown, ' + removed.removedFaceUp.length + ' faceup.', 'The Queen picks a role first.']
      };
    }
    case 'PICK_ROLE':
      const { playerId, roleId } = action.payload;
      const playerIndex = state.players.findIndex(p => p.id === playerId);
      const role = state.availableRoles.find(r => r.id === roleId);

      // Guard: ignore invalid picks (can happen if UI/bot gets out of sync)
      if (playerIndex === -1 || !role) {
        return {
          ...state,
          log: [...state.log, `Draft pick ignored (playerId=${playerId}, roleId=${roleId}).`]
        };
      }
      
      // Assign role to player
      const updatedPlayers = [...state.players];
      updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], role: role, roleRevealed: false };

      // Remove role from available pool
      const remainingRoles = state.availableRoles.filter(r => r.id !== roleId);

      // Next player logic
      const nextPlayerIndex = (playerIndex + 1) % state.players.length;
      const nextPlayerId = updatedPlayers[nextPlayerIndex].id;

      // Check if Draft is done (everyone has a role)
      const isDraftDone = updatedPlayers.every(p => !!p.role);

      if (isDraftDone) {
        // Automatically find the first player (Role 1 or higher)
        // We reuse the logic from START_ACTION_PHASE effectively by returning
        // a state that's ready for the UI to trigger it, OR we call the helper directly.
        // Let's call the helper directly to transition immediately.
        const tempState = {
            ...state,
            players: updatedPlayers,
            availableRoles: remainingRoles
        };
        return nextRoleTurn(tempState, 1);
      }

      return {
        ...state,
        players: updatedPlayers,
        availableRoles: remainingRoles,
        currentPlayerId: nextPlayerId,
        log: [...state.log, `${state.players[playerIndex].name} picked a hidden role.`]
      };
    case 'START_ACTION_PHASE': {
        const players = (state.players || []).map(p => ({ ...p, roleRevealed: false }));
        return nextRoleTurn({ ...state, players }, 1); // Start checking from Role 1
    }

    case 'END_TURN': {
        const idx = state.players.findIndex(p => p.id === state.currentPlayerId);
        if (idx >= 0) {
          const players = [...state.players];
          players[idx] = { ...players[idx], roleRevealed: true };
          return nextRoleTurn({ ...state, players }, state.currentRoleId + 1);
        }
        return nextRoleTurn(state, state.currentRoleId + 1);
    }

    case 'START_NEW_ROUND': {
      // Keep players (gold/hand/city), deck, and turn counter; reset roles + draft.
      const resetRoles = state.roles.map(r => ({ id: r.id, name: r.name, img: r.img }));
      const playersResetForDraft = state.players.map(p => ({
        ...p,
        role: null,
        hasTakenAction: false,
        builtThisTurn: 0,
        buildLimit: 1,
      }));

      // Ensure we have a king; default to first player
      const kingId = state.kingId ?? state.players[0]?.id ?? null;
      const nextTurn = (state.turn || 0) + 1;
      const removed = removeCharactersForRound(resetRoles, state.players.length);

      return {
        ...state,
        removedFaceUpRoles: removed.removedFaceUp,
        removedFaceDownRole: removed.removedFaceDown,
        turn: nextTurn,
        phase: 'draft',
        roles: resetRoles,
        availableRoles: removed.availableRoles,
        players: playersResetForDraft,
        currentRoleId: null,
        currentPlayerId: kingId,
        kingId,
        interaction: null,
        isDrawing: false,
        drawnCards: [],
        log: [...state.log, `--- New Round ${nextTurn} ---`, 'Removed characters: 1 facedown, ' + removed.removedFaceUp.length + ' faceup.', 'The Queen picks a role first.'],
      };
    }

    case 'USE_SMITHY': {
        const pIndex = state.players.findIndex(p => p.id === state.currentPlayerId);
        if (pIndex === -1) return state;
        const me = state.players[pIndex];
        if (!hasUnique(me, UNIQUE_BUILDINGS.SMITHY)) return state;

        const used = me.usedUniqueThisTurn || {};
        if (used.smithy) return state;

        if ((me.gold || 0) < 2) {
            return { ...state, log: [...state.log, `${me.name} tried to use Smithy but lacks gold.`] };
        }

        const drawn = state.deck.slice(0, 3);
        const remainingDeck = state.deck.slice(3);

        const newPlayers = [...state.players];
        newPlayers[pIndex] = {
            ...me,
            gold: (me.gold || 0) - 2,
            hand: [...(me.hand || []), ...drawn],
            usedUniqueThisTurn: { ...used, smithy: true },
        };

        return {
            ...state,
            deck: remainingDeck,
            players: newPlayers,
            log: [...state.log, `${me.name} used Smithy (paid 2 gold, drew ${drawn.length}).`],
        };
    }

    case 'USE_LAB_START': {
        const pIndex = state.players.findIndex(p => p.id === state.currentPlayerId);
        if (pIndex === -1) return state;
        const me = state.players[pIndex];
        if (!hasUnique(me, UNIQUE_BUILDINGS.LAB)) return state;

        const used = me.usedUniqueThisTurn || {};
        if (used.lab) return state;

        if (!(me.hand || []).length) {
            return { ...state, log: [...state.log, `${me.name} tried to use Laboratory but has no cards.`] };
        }

        return { ...state, interaction: { type: 'LAB_DISCARD', playerId: me.id } };
    }

    case 'USE_LAB_DISCARD': {
        const { cardId } = action.payload || {};
        const pIndex = state.players.findIndex(p => p.id === state.currentPlayerId);
        if (pIndex === -1) return { ...state, interaction: null };
        const me = state.players[pIndex];

        const used = me.usedUniqueThisTurn || {};
        if (used.lab) return { ...state, interaction: null };

        const hand = (me.hand || []).slice();
        const ci = hand.findIndex(c => c.id === cardId);
        if (ci === -1) return { ...state, interaction: null };

        const discarded = hand[ci];
        hand.splice(ci, 1);

        const newPlayers = [...state.players];
        newPlayers[pIndex] = {
            ...me,
            hand,
            gold: (me.gold || 0) + 2,
            usedUniqueThisTurn: { ...used, lab: true },
        };

        return {
            ...state,
            players: newPlayers,
            interaction: null,
            log: [...state.log, `${me.name} used Laboratory (discarded ${discarded.name}, +2 gold).`],
        };
    }


    default:
      return state;
  }
}

// Helper to find the next active player based on Role ID
function nextRoleTurn(state, startRoleId) {
    let roleId = startRoleId;
    
    // Loop through roles 1 to 8 to find the next player
    while (roleId <= 8) {
        // Check if role was assassinated
        const roleData = state.roles.find(r => r.id === roleId);
        if (roleData && roleData.killed) {
            // Role was killed! Skip turn silently.
            // Log it? Usually it's revealed only when the turn *would* happen.
            // But for simplicity, we log it and move on.
            roleId++;
            continue;
        }

        // Find player and reset their turn state
        const playerIndex = state.players.findIndex(p => p.role && p.role.id === roleId);
        
        if (playerIndex !== -1) {
            const playerWithRole = state.players[playerIndex];
            
            // --- APPLY TURN START BONUSES ---
            let extraLog = [];
            let goldBonus = 0;
            let cardBonus = [];
            let buildLimitBonus = 0;

            // 4. Queen: Takes the crown immediately
            let newKingId = state.kingId;
            if (roleId === 4) {
                newKingId = playerWithRole.id;
                extraLog.push("The Queen takes the crown!");
            }

            // 6. Merchant: +1 Gold
            if (roleId === 6) {
                goldBonus += 1;
                extraLog.push("Merchant receives 1 bonus gold.");
            }

            // Color income bonuses: +1 gold per district of the role's color
            // King (4): noble/yellow, Bishop (5): religious/blue, Merchant (6): trade/green, Warlord (8): military/red
            // Magic School counts as a district of the active role's color for income.
            const cityCards = (playerWithRole.city || []);
            const countColor = (color) => cityCards.filter(c => c.color === color).length;
            const hasMagicSchool = cityCards.some(c => c.name === UNIQUE_BUILDINGS.MAGIC_SCHOOL);
            let colorIncome = 0;
            if (roleId === 4) colorIncome = countColor('noble') + (hasMagicSchool ? 1 : 0);
            if (roleId === 5) colorIncome = countColor('religious') + (hasMagicSchool ? 1 : 0);
            if (roleId === 6) colorIncome = countColor('trade') + (hasMagicSchool ? 1 : 0);
            if (roleId === 8) colorIncome = countColor('military') + (hasMagicSchool ? 1 : 0);
            if (colorIncome > 0) {
                goldBonus += colorIncome;
                extraLog.push(`Income: +${colorIncome} gold from districts.`);
            }

            // 7. Architect: +2 Cards
            if (roleId === 7) {
                // Draw 2 cards from deck
                const drawn = state.deck.slice(0, 2);
                cardBonus = drawn;
                extraLog.push("Architect draws 2 extra cards.");
                // Note: We need to remove them from deck in the returned state
            }

            

            // --- THIEF PAYOUT ---
            // If this role was marked as robbed, transfer all victim gold to the Thief (roleId=2) when victim is called.
            let robberyLog = [];
            let rolesAfterRobbery = state.roles;
            let victimGoldAfterRobbery = playerWithRole.gold + goldBonus; // include start-of-turn gold bonus
            let thiefGoldDelta = 0;

            if (roleData && roleData.robbed) {
                const thiefRole = state.roles.find(r => r.id === 2);
                const thiefIsKilled = !!(thiefRole && thiefRole.killed);
                const thiefIdx = state.players.findIndex(p => p.role && p.role.id === 2);

                if (thiefIdx !== -1 && !thiefIsKilled) {
                    thiefGoldDelta = victimGoldAfterRobbery;
                    victimGoldAfterRobbery = 0;
                    robberyLog.push(`The Thief steals ${thiefGoldDelta} gold from ${playerWithRole.name}!`);
                } else {
                    robberyLog.push(`A robbery was attempted, but the Thief is unavailable.`);
                }

                rolesAfterRobbery = state.roles.map(r => r.id === roleId ? { ...r, robbed: false } : r);
            }

// Reset action flags for the new turn
            const resetPlayers = [...state.players];
            resetPlayers[playerIndex] = { 
                ...playerWithRole, 
                hasTakenAction: false,
                abilityUsed: false,
                builtThisTurn: 0,
                buildLimit: (roleId === 7) ? 3 : 1, // Architect builds 3
                gold: victimGoldAfterRobbery,
                hand: [...playerWithRole.hand, ...cardBonus],
                usedUniqueThisTurn: {}
            };

            // Apply stolen gold to thief if needed
            if (thiefGoldDelta > 0) {
                const thiefIdx2 = state.players.findIndex(p => p.role && p.role.id === 2);
                if (thiefIdx2 !== -1) {
                    resetPlayers[thiefIdx2] = {
                        ...resetPlayers[thiefIdx2],
                        gold: (resetPlayers[thiefIdx2].gold || 0) + thiefGoldDelta
                    };
                }
            }

            const remainingDeck = (cardBonus.length > 0) ? state.deck.slice(2) : state.deck;

            return {
                ...state,
                roles: rolesAfterRobbery,
                players: resetPlayers,
                deck: remainingDeck,
                kingId: newKingId,
                phase: 'action',
                currentRoleId: roleId,
                currentPlayerId: playerWithRole.id,
                log: [...state.log, `Calling ${playerWithRole.role.name}... It is ${playerWithRole.name}'s turn.`, ...extraLog, ...robberyLog]
            };
        }
        
        // No player has this role, skip
        roleId++;
    }

    // If we go past 8, the round is over
    if (state.isGameEnding) {
        // Trigger End Game Scoring
        // We need to return a state that triggers the END_GAME_SCORING dispatch, 
        // OR calculate it here. Since this is a helper, calculating here is cleaner.
        // Actually, let's just set phase to 'calculating_score' and let the UI trigger the final tally
        // or auto-trigger it.
        // For simplicity: return a special state that the UI sees and dispatches 'END_GAME_SCORING'.
        return {
            ...state,
            phase: 'round_end_check', // Temporary phase to decide if we continue or end
            currentRoleId: null,
            currentPlayerId: null,
            log: [...state.log, "Round Over! Checking for game end condition..."]
        };
    }

    return {
        ...state,
        phase: 'end_round', // Or loop back to draft?
        currentRoleId: null,
        currentPlayerId: null,
        log: [...state.log, "End of Round! All roles have acted."]
    };
}

// Context
const GameContext = createContext();

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
