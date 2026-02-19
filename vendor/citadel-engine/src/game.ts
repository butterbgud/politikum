// AUTO-PORTED from ohmp-mob/src/multiplayer/Game.js (baseline).
// TODO: tighten types + extract constants to separate modules.

import { INVALID_MOVE } from 'boardgame.io/dist/cjs/core.js';

const MEDIEVAL_NAMES = ["Aethelred","Baldwin","Cedric","Dunstan","Eadric","Florian","Godfrey","Hildegard","Isolde","Jocelyn","Kenric","Leofric"];



const ROLES = [
  { id: 1, name: 'Assassin', img: '/assets/characters/assassin.jpg' },
  { id: 2, name: 'Thief', img: '/assets/characters/thief.jpg' },
  { id: 3, name: 'Magician', img: '/assets/characters/magician.jpg' },
  { id: 4, name: 'Queen', img: '/assets/characters/queen.jpg' },
  { id: 5, name: 'Bishop', img: '/assets/characters/bishop.jpg' },
  { id: 6, name: 'Merchant', img: '/assets/characters/merchant.jpg' },
  { id: 7, name: 'Architect', img: '/assets/characters/architect.jpg' },
  { id: 8, name: 'Warlord', img: '/assets/characters/warlord.jpg' },
];

const DISTRICTS = [
    // Noble
    { id: 101, name: 'Manor', cost: 3, color: 'noble', img: '/assets/buildings/manor2.jpg' },
    { id: 102, name: 'Castle', cost: 4, color: 'noble', img: '/assets/buildings/castle3.jpg' },
    { id: 103, name: 'Palace', cost: 5, color: 'noble', img: '/assets/buildings/palace2.jpg' },

    // Trade
    { id: 201, name: 'Tavern', cost: 1, color: 'trade', img: '/assets/buildings/tavern.jpg' },
    { id: 202, name: 'Market', cost: 2, color: 'trade', img: '/assets/buildings/market.jpg' },
    { id: 206, name: 'Trading Post', cost: 2, color: 'trade', img: '/assets/buildings/trading%20post.jpg' },
    { id: 203, name: 'Docks', cost: 3, color: 'trade', img: '/assets/buildings/Docks.jpg' },
    { id: 204, name: 'Harbor', cost: 4, color: 'trade', img: '/assets/buildings/harbor.jpg' },
    { id: 205, name: 'Town Hall', cost: 5, color: 'trade', img: '/assets/buildings/town%20hall.jpg' },

    // Religious
    { id: 301, name: 'Temple', cost: 1, color: 'religious', img: '/assets/buildings/chapel2.jpg' },
    { id: 302, name: 'Church', cost: 2, color: 'religious', img: '/assets/buildings/church2.jpg' },
    { id: 303, name: 'Monastery', cost: 3, color: 'religious', img: '/assets/buildings/monastery2.jpg' },
    { id: 304, name: 'Cathedral', cost: 5, color: 'religious', img: '/assets/buildings/cathedral4.jpg' },

    // Military
    { id: 401, name: 'Watchtower', cost: 1, color: 'military', img: '/assets/buildings/watchtower2.jpg' },
    { id: 402, name: 'Prison', cost: 2, color: 'military', img: '/assets/buildings/prison3.jpg' },
    { id: 403, name: 'Barracks', cost: 3, color: 'military', img: '/assets/buildings/barracks2.jpg' },
    { id: 404, name: 'Fortress', cost: 5, color: 'military', img: '/assets/buildings/Fortress2.jpg' },

    // Unique (purple)
    { id: 501, name: 'Library', cost: 6, color: 'unique', img: '/assets/buildings/library.jpg' },
    { id: 502, name: 'Smithy', cost: 5, color: 'unique', img: '/assets/buildings/smithy2.jpg' },
    { id: 503, name: 'Observatory', cost: 4, color: 'unique', img: '/assets/buildings/observatory.jpg' },
    { id: 504, name: 'Graveyard', cost: 5, color: 'unique', img: '/assets/buildings/graveyard.jpg' },
    { id: 505, name: 'Laboratory', cost: 5, color: 'unique', img: '/assets/buildings/Laboratory2.jpg' },
    { id: 506, name: 'Keep', cost: 3, color: 'unique', img: '/assets/buildings/keep.jpg' },
    { id: 507, name: 'Haunted Quarter', cost: 2, color: 'unique', img: '/assets/buildings/haunted%20quarter.jpg' },
    { id: 508, name: 'Great Wall', cost: 6, color: 'unique', img: '/assets/buildings/great%20wall.jpg' },
    { id: 509, name: 'Magic School', cost: 6, color: 'unique', img: '/assets/buildings/magic%20school.jpg' },
    { id: 510, name: 'Imperial Treasury', cost: 5, color: 'unique', img: '/assets/buildings/imperial%20treasury.jpg' },
    { id: 511, name: 'Map Room', cost: 5, color: 'unique', img: '/assets/buildings/map%20room.jpg' },
    { id: 512, name: 'University', cost: 6, color: 'unique', img: '/assets/buildings/University.jpg' },
    { id: 513, name: 'Dragon Gate', cost: 6, color: 'unique', img: '/assets/buildings/dragon%20gate.jpg' },
];

function setupCharacterDeck(G) {
    const rolesPool = [...ROLES];
    for (let i = rolesPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rolesPool[i], rolesPool[j]] = [rolesPool[j], rolesPool[i]];
    }
    
    // 1. One card always discarded face down
    G.removedFaceDownRole = rolesPool.splice(0, 1)[0];
    
    // 2. Discard face up based on player count
    // 4 players -> 2 face up
    // 5 players -> 1 face up
    // 6-7 players -> 0 face up
    let faceUpCount = 0;
    if (G.players.length === 4) faceUpCount = 2;
    else if (G.players.length === 5) faceUpCount = 1;

    G.removedFaceUpRoles = [];
    for (let i = 0; i < faceUpCount; i++) {
        // Rule: The King/Queen (ID 4) cannot be discarded face up
        let idx = rolesPool.findIndex(r => r.id !== 4);
        if (idx !== -1) {
            G.removedFaceUpRoles.push(rolesPool.splice(idx, 1)[0]);
        }
    }

    G.availableRoles = rolesPool.sort((a, b) => a.id - b.id);
}

function advanceRole(G, events) {
    let nextRole = G.activeRoleId + 1;
    let found = false;
    while (nextRole <= 8 && !found) {
        const nextP = G.players.find(pl => pl.role?.id === nextRole);
        if (nextP) {
            found = true;
            G.activeRoleId = nextRole;
            G.log.push(`The ${nextP.role.name} steps forward.`);
            
            if (nextRole === G.killedRoleId) {
                nextP.isKilled = true;
                G.log.push(`The ${nextP.role.name} was found dead!`);
                nextP.hasTakenAction = false;
                nextP.builtThisTurn = 0;
                nextP.abilityUsed = false;
                // DO NOT recursive call here, just increment and loop
                nextRole++;
                found = false;
                continue;
            }

            if (nextRole === G.robbedRoleId) {
                const robber = G.players[G.robberPlayerId];
                if (robber && !robber.isKilled) {
                    const loot = nextP.gold;
                    nextP.gold = 0;
                    robber.gold += loot;
                    G.log.push(`The ${nextP.role.name} was robbed of ${loot} gold!`);
                }
                // Clear robbedRoleId so it doesn't fire again if multiple players have same role id (shouldn't happen but safe)
                G.robbedRoleId = null;
            }
            // Start-of-role reset (per-turn flags)
            nextP.hasTakenAction = false;
            nextP.builtThisTurn = 0;
            nextP.abilityUsed = false;
            nextP.interaction = null;
            nextP.buildLimit = (nextRole === 7) ? 3 : 1; // Architect builds up to 3

            // Architect: draw 2 extra cards immediately when called.
            if (nextRole === 7) {
                const bonus = G.deck.splice(0, 2);
                nextP.hand.push(...bonus);
                G.log.push(`${nextP.name} (Architect) drew ${bonus.length} extra cards.`);
            }

            events.endTurn({ next: nextP.id });
        } else {
            nextRole++;
        }
    }

    if (!found) {
        if (G.firstToFinishId !== null) {
            G.players.forEach(p => {
                p.score = p.city.reduce((acc, c) => acc + c.cost, 0);
                if (p.id === G.firstToFinishId) p.score += 4;
            });
            events.setPhase('results');
        } else {
            G.players.forEach(pl => { pl.role = null; pl.isKilled = false; });
            G.activeRoleId = 0;
            G.killedRoleId = null;
            G.robbedRoleId = null;
            // Hard reset into next round draft. In some boardgame.io timings, setPhase alone can
            // leave the client appearing stuck if the current turn doesn't advance.
            events.setPhase('draft');
            events.endTurn({ next: G.kingId });
        }
    }
}

// Logic check: returns true if player can build anything from hand
const canPlayerBuildAny = (p) => {
    if (p.builtThisTurn >= p.buildLimit) return false;
    return p.hand.some(card => p.gold >= card.cost && !p.city.some(c => c.name === card.name));
};

// Logic check: returns true if player has a character ability they can/should use
const canPlayerUseAbility = (p) => {
    if (p.abilityUsed) return false;
    // Simple check: Assassin, Thief, Warlord have active targetable abilities
    return [1, 2, 8].includes(p.role?.id);
};

// Unique district helpers
const hasUnique = (p, name) => (p.city || []).some((c) => c.name === name);


const checkAutoEnd = (G, playerID, events) => {
    const p = G.players[playerID];
    if (!p.hasTakenAction) return; // Haven't started turn yet
    if (canPlayerBuildAny(p)) return; // Can still build
    if (canPlayerUseAbility(p)) return; // Can still use ability
    
    // Nothing left to do!
    G.log.push(`(Auto-ending ${p.name}'s turn - no actions left)`);
    p.hasTakenAction = false;
    p.builtThisTurn = 0;
    p.abilityUsed = false;
    p.interaction = null;
    advanceRole(G, events);
};

export const CitadelGame = {
  name: 'citadel',

  setup: ({ ctx }) => ({
    players: Array(ctx.numPlayers).fill(null).map((_, id) => ({
      id: String(id),
      name: id === 0 ? `Player 0` : `[B] ${MEDIEVAL_NAMES[Math.floor(Math.random() * MEDIEVAL_NAMES.length)]}`,
      gold: 2,
      hand: [],
      city: [],
      role: null,
      tempChoices: [],
      hasTakenAction: false,
      builtThisTurn: 0,
      buildLimit: 1,
      isKilled: false,
      isRobbed: false,
      abilityUsed: false,
      score: 0,
      isBot: id === 0 ? false : true,
    })),
    deck: DISTRICTS, 
    availableRoles: [],
    removedFaceUpRoles: [],
    removedFaceDownRole: null,
    kingId: '0',
    activeRoleId: 0,
    killedRoleId: null,
    robbedRoleId: null,
    robberPlayerId: null,
    isGameOver: false,
    firstToFinishId: null,
    log: ['Multiplayer Citadel Initialized'],
    chat: [],
  }),

  moves: {
    updatePlayerName: ({ G, playerID }, name) => {
        if (G.players[playerID]) {
            G.players[playerID].name = name;
            G.players[playerID].isBot = false;
        }
    },

    // DEV CHEATS (temporary): grant/build uniques without RNG for testing.
    devGiveDistrict: ({ G, playerID }, name) => {
        if (playerID !== '0') return INVALID_MOVE;
        const p = G.players[playerID];
        const card = (G.deck || []).find((c) => c.name === name) || (DISTRICTS || []).find((c) => c.name === name);
        if (!card) return INVALID_MOVE;
        p.hand.push({ ...card });
        G.log.push(`[DEV] Gave ${p.name} district: ${name}`);
    },

    devBuildFree: ({ G, playerID }, name) => {
        if (playerID !== '0') return INVALID_MOVE;
        const p = G.players[playerID];
        const idx = p.hand.findIndex((c) => c.name === name);
        if (idx === -1) return INVALID_MOVE;
        const card = p.hand.splice(idx, 1)[0];
        p.city.push(card);
        G.log.push(`[DEV] Built for free: ${name}`);
    },

    devSetGold: ({ G, playerID }, amount) => {
        if (playerID !== '0') return INVALID_MOVE;
        const p = G.players[playerID];
        p.gold = Number(amount) || 0;
        G.log.push(`[DEV] Set gold=${p.gold}`);
    },


    addBot: ({ G, playerID }) => {
        if (playerID !== '0') return INVALID_MOVE;
        const freeSeat = G.players.find(p => !p.isBot && !p.name.startsWith('[H] '));
        if (freeSeat) {
            freeSeat.isBot = true;
            freeSeat.name = `[B] ${MEDIEVAL_NAMES[Math.floor(Math.random() * MEDIEVAL_NAMES.length)]}`;
            G.log.push(`${freeSeat.name} has joined the hall.`);
        }
    },

    removePlayer: ({ G, playerID }, targetId) => {
        if (playerID !== '0' || targetId === '0') return INVALID_MOVE;
        const p = G.players.find(pl => pl.id === targetId);
        if (p) {
            G.log.push(`${p.name} has been dismissed from the hall.`);
            p.isBot = false;
            p.name = `[H] ${MEDIEVAL_NAMES[Math.floor(Math.random() * MEDIEVAL_NAMES.length)]}`;
        }
    },

    submitChat: ({ G, playerID }, text) => {
        if (!text || text.trim() === "") return;
        const name = G.players[playerID]?.name || `Player ${playerID}`;
        G.chat.push({ sender: name, text: text.trim(), timestamp: Date.now() });
        if (G.chat.length > 50) G.chat.shift();
    },

    submitBotAction: ({ G, ctx, events, playerID }, actionType, payload) => {
        if (playerID !== '0') return INVALID_MOVE;
        const botId = ctx.currentPlayer;
        const bot = G.players[botId];
        if (!bot || !bot.isBot) return INVALID_MOVE;

        switch (actionType) {
            case 'PICK_ROLE': {
                 const roleId = payload?.roleId;
                 if (bot.role !== null) return INVALID_MOVE;
                 const role = G.availableRoles.find(r => r.id === roleId);
                 if (!role) return INVALID_MOVE;
                 bot.role = role;
                 G.availableRoles = G.availableRoles.filter(r => r.id !== roleId);
                 G.log.push(`A role has been claimed in secret.`);
                 events.endTurn();
                 break;
            }
            case 'TAKE_GOLD': {
                if (bot.hasTakenAction || bot.isKilled) return INVALID_MOVE;
                bot.gold += 2;
                bot.hasTakenAction = true;
                G.log.push(`${bot.name} took 2 gold.`);
                checkAutoEnd(G, botId, events);
                break;
            }
            case 'KEEP_CARD': {
                const cardId = payload?.cardId;
                const card = bot.tempChoices.find(c => c.id === cardId);
                const discarded = bot.tempChoices.find(c => c.id !== cardId);
                if (!card) return INVALID_MOVE;
                bot.hand.push(card);
                if (discarded) G.deck.push(discarded);
                bot.tempChoices = [];
                G.log.push(`${bot.name} added a plan.`);
                checkAutoEnd(G, botId, events);
                break;
            }
            case 'BUILD_DISTRICT': {
                 const cardId = payload?.cardId;
                 if (bot.isKilled) return INVALID_MOVE;
                 const cardIndex = bot.hand.findIndex(c => c.id === cardId);
                 if (cardIndex === -1 || bot.gold < bot.hand[cardIndex].cost || bot.builtThisTurn >= bot.buildLimit) return INVALID_MOVE;
                 if (bot.city.some(c => c.name === bot.hand[cardIndex].name)) return INVALID_MOVE;
                 bot.gold -= bot.hand[cardIndex].cost;
                 const built = bot.hand.splice(cardIndex, 1)[0];
                 bot.city.push(built);
                 bot.builtThisTurn += 1;
                 G.log.push(`${bot.name} constructed ${built.name}.`);
                 if (bot.city.length >= 8 && !G.firstToFinishId) {
                     G.firstToFinishId = botId;
                     G.log.push(`${bot.name} has completed their city!`);
                 }
                 checkAutoEnd(G, botId, events);
                 break;
            }
            case 'RESOLVE_INTERACTION': {
                const p = bot;
                if (payload.type === 'ASSASSINATE') {
                    G.killedRoleId = payload.target;
                    p.abilityUsed = true;
                    const targetName = ROLES.find(r => r.id === payload.target).name;
                    G.log.push(`${p.name} has marked the ${targetName} for death.`);
                }
                else if (payload.type === 'STEAL') {
                    G.robbedRoleId = payload.target;
                    G.robberPlayerId = botId;
                    p.abilityUsed = true;
                    const targetName = ROLES.find(r => r.id === payload.target).name;
                    G.log.push(`${p.name} plans to rob the ${targetName}.`);
                }
                else if (payload.type === 'DESTROY') {
                    const targetP = G.players.find(pl => pl.id === payload.playerId);
                    const cardIdx = targetP?.city.findIndex(c => c.id === payload.cardId);
                    if (cardIdx !== -1) {
                        const card = targetP.city.splice(cardIdx, 1)[0];
                        const cost = Math.max(0, card.cost - 1);
                        p.gold -= cost;
                        G.log.push(`${p.name} razed ${card.name} from ${targetP.name}'s city.`);
                    }
                }
                p.interaction = null;
                checkAutoEnd(G, botId, events);
                break;
            }
            case 'END_TURN': {
                G.log.push(`${bot.name} finishes turn.`);
                bot.hasTakenAction = false;
                bot.builtThisTurn = 0;
                bot.abilityUsed = false;
                bot.interaction = null;
                advanceRole(G, events);
                break;
            }
            default:
                return INVALID_MOVE;
        }
    },

    startGame: ({ G, ctx, events }) => {
        G.log.push('Queen: Shuffling Deck and Blueprints...');
        G.deck = [...G.deck].sort(() => Math.random() - 0.5);
        G.players.forEach(p => { p.hand = G.deck.splice(0, 4); });
        events.setPhase('draft'); 
    },

    pickRole: ({ G, playerID, events, ctx }, roleId) => {
      if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
      if (G.players[playerID].role !== null) return INVALID_MOVE;
      const role = G.availableRoles.find(r => r.id === roleId);
      if (!role) return INVALID_MOVE;
      G.players[playerID].role = role;
      G.availableRoles = G.availableRoles.filter(r => r.id !== roleId);
      G.log.push(`A role has been claimed in secret.`);
      events.endTurn();
    },

    takeGold: ({ G, playerID, ctx, events }) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        if (p.hasTakenAction || p.isKilled) return INVALID_MOVE;
        p.gold += 2;
        p.hasTakenAction = true;
        G.log.push(`${p.name} took 2 gold.`);
        checkAutoEnd(G, playerID, events);
    },

    drawCards: ({ G, playerID, ctx }) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        if (p.hasTakenAction || p.isKilled) return INVALID_MOVE;
        const drawN = hasUnique(p, 'Observatory') ? 3 : 2;
        const drawn = G.deck.splice(0, drawN);
        p.hasTakenAction = true;

        // Library: keep all drawn cards immediately (no choose-1).
        if (hasUnique(p, 'Library')) {
            p.hand.push(...drawn);
            p.tempChoices = [];
            G.log.push(`${p.name} drew ${drawn.length} cards (Library).`);
            // NOTE: still counts as taking the draw action.
            // checkAutoEnd will run on later moves; ok for MVP.
            return;
        }

        p.tempChoices = drawn;
        G.log.push(`${p.name} is studying blueprints...`);
    },

    keepCard: ({ G, playerID, ctx, events }, cardId) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        const card = p.tempChoices.find(c => c.id === cardId);
        const discarded = p.tempChoices.find(c => c.id !== cardId);
        if (!card) return INVALID_MOVE;
        p.hand.push(card);
        if (discarded) G.deck.push(discarded);
        p.tempChoices = [];
        G.log.push(`${p.name} added a plan.`);
        checkAutoEnd(G, playerID, events);
    },

    buildDistrict: ({ G, playerID, ctx, events }, cardId) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        if (p.isKilled) return INVALID_MOVE;
        // Match SP: you must take an action first (take gold or draw cards) before building.
        if (!p.hasTakenAction) return INVALID_MOVE;
        const cardIndex = p.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1 || p.gold < p.hand[cardIndex].cost || p.builtThisTurn >= p.buildLimit) return INVALID_MOVE;
        if (p.city.some(c => c.name === p.hand[cardIndex].name)) return INVALID_MOVE;
        p.gold -= p.hand[cardIndex].cost;
        const built = p.hand.splice(cardIndex, 1)[0];
        p.city.push(built);
        p.builtThisTurn += 1;
        G.log.push(`${p.name} constructed ${built.name}.`);
        if (p.city.length >= 8 && !G.firstToFinishId) {
            G.firstToFinishId = playerID;
            G.log.push(`${p.name} has completed their city!`);
        }
        checkAutoEnd(G, playerID, events);
    },

    resolveInteraction: ({ G, playerID, ctx, events }, payload) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        
        if (payload.type === 'ASSASSINATE') {
            G.killedRoleId = payload.target;
            p.abilityUsed = true;
            const targetName = ROLES.find(r => r.id === payload.target).name;
            G.log.push(`${p.name} has marked the ${targetName} for death.`);
        }
        else if (payload.type === 'STEAL') {
            G.robbedRoleId = payload.target;
            G.robberPlayerId = playerID;
            p.abilityUsed = true;
            const targetName = ROLES.find(r => r.id === payload.target).name;
            G.log.push(`${p.name} plans to rob the ${targetName}.`);
        }
        else if (payload.type === 'DESTROY') {
            const targetP = G.players.find(pl => pl.id === payload.playerId);
            const cardIdx = targetP?.city.findIndex(c => c.id === payload.cardId);
            if (cardIdx !== -1) {
                const card = targetP.city.splice(cardIdx, 1)[0];
                const cost = Math.max(0, card.cost - 1);
                p.gold -= cost;
                p.abilityUsed = true;
                G.log.push(`${p.name} razed ${card.name} from ${targetP.name}'s city.`);
            }
        }
        
        G.players[playerID].interaction = null;
        checkAutoEnd(G, playerID, events);
    },

    activateAbility: ({ G, playerID, ctx }) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        if (p.abilityUsed || !p.hasTakenAction) return INVALID_MOVE;

        if (p.role.id === 1) { // Assassin
            p.interaction = { type: 'ASSASSINATE', options: [2,3,4,5,6,7,8].filter(id => id !== G.killedRoleId) };
        }
        else if (p.role.id === 2) { // Thief
            p.interaction = { type: 'STEAL', options: [3,4,5,6,7,8].filter(id => id !== G.killedRoleId) };
        }
        else if (p.role.id === 8) { // Warlord
            const options = [];
            G.players.forEach(pl => {
                if (pl.id !== playerID && pl.city.length < 8 && pl.role?.id !== 5) {
                    pl.city.forEach(c => options.push({ playerId: pl.id, cardId: c.id }));
                }
            });
            p.interaction = { type: 'DESTROY', options };
        }
    },

    // Purple unique moves
    useSmithy: ({ G, playerID, ctx }) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        if (p.isKilled) return INVALID_MOVE;
        if (!p.hasTakenAction) return INVALID_MOVE; // after takeGold/drawCards in SP flow
        if (!hasUnique(p, 'Smithy')) return INVALID_MOVE;
        if (p.gold < 2) return INVALID_MOVE;
        p.gold -= 2;
        const drawn = G.deck.splice(0, 3);
        p.hand.push(...drawn);
        p.abilityUsed = true;
        G.log.push(`${p.name} used Smithy (paid 2 gold, drew ${drawn.length}).`);
    },

    labStart: ({ G, playerID, ctx }) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        if (p.isKilled) return INVALID_MOVE;
        if (!p.hasTakenAction) return INVALID_MOVE;
        if (!hasUnique(p, 'Laboratory')) return INVALID_MOVE;
        if (p.hand.length === 0) return INVALID_MOVE;
        p.interaction = { type: 'LAB_DISCARD', options: p.hand.map(c => c.id) };
    },

    labDiscard: ({ G, playerID, ctx, events }, cardId) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        if (!p.interaction || p.interaction.type !== 'LAB_DISCARD') return INVALID_MOVE;
        const idx = p.hand.findIndex(c => c.id === cardId);
        if (idx === -1) return INVALID_MOVE;
        const discarded = p.hand.splice(idx, 1)[0];
        G.deck.push(discarded);
        p.gold += 1;
        p.abilityUsed = true;
        p.interaction = null;
        G.log.push(`${p.name} used Laboratory (discarded ${discarded.name} for 1 gold).`);
        checkAutoEnd(G, playerID, events);
    },

    endTurn: ({ G, playerID, events, ctx }) => {
        if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
        const p = G.players[playerID];
        G.log.push(`${p.name} finishes turn.`);
        p.hasTakenAction = false;
        p.builtThisTurn = 0;
        p.abilityUsed = false;
        p.interaction = null;
        advanceRole(G, events);
    }
  },

  phases: {
    lobby: { 
      start: true, 
      next: 'draft',
      turn: { activePlayers: { all: 'lobby' } }
    },
    draft: {
      onBegin: ({ G }) => {
          G.log.push('*** NEW ROUND DRAFT ***');
          setupCharacterDeck(G);
      },
      turn: {
          order: {
              first: ({ G }) => parseInt(G.kingId),
              next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
          },
          onBegin: ({ G, ctx, events }) => {
              const p = G.players[ctx.currentPlayer];
              if (p.isBot && G.availableRoles.length > 0) {
                  // Simple Bot Pick: Just take the first available
                  const role = G.availableRoles.shift();
                  p.role = role;
                  G.log.push(`[B] ${p.name} claimed a role.`);
                  events.endTurn();
              }
          }
      },
      endIf: ({ G }) => G.players.every(p => p.role !== null),
      next: 'action',
    },
    action: {
        turn: { 
            onBegin: ({ G, ctx, events }) => {
                const p = G.players[ctx.currentPlayer];
                if (p.isBot) {
                    // Action Bots still need work, but for now just end turn
                    G.log.push(`[B] ${p.name} is thinking...`);
                    p.gold += 2;
                    events.endTurn();
                }
            }
        },
        onBegin: ({ G, events }) => {
            G.log.push('*** THE CALL BEGINS ***');
            G.activeRoleId = 0;
            advanceRole(G, events);
        }
    },
    results: {}
  }
};

export const CitadelLobby = {
  name: 'citadel-lobby',
  setup: () => ({ chat: [] }),
  moves: {
    submitChat: ({ G }, payload) => {
      const msg = typeof payload === 'string' ? { sender: 'System', text: payload } : payload;
      G.chat.push({ ...msg, timestamp: Date.now() });
      if (G.chat.length > 50) G.chat.shift();
    }
  },
  turn: {
    activePlayers: { all: 'chatting' }
  }
};
