# Citadel Engine — Porting Checklist (SP → Mobile baseline)

Goal: use **mobile MP** (`ohmp-mob/src/multiplayer/Game.js`) as the baseline engine, and port any **missing mechanics** from **SP** (`citadel-sp/src/GameContext.jsx`).

## Current baseline
- Engine seed source: `ohmp-mob/src/multiplayer/Game.js`
- SP reference: `citadel-sp/src/GameContext.jsx`

## High-signal diff summary
### District set
Mobile baseline districts (current):
- Manor, Castle, Palace
- Tavern, Market, Docks, Harbor, Town Hall
- Temple, Church, Monastery, Cathedral
- Watchtower, Prison, Barracks, Fortress

SP includes additional districts + **purple uniques**:
- Trading Post
- Library
- Smithy
- Observatory
- Graveyard
- Laboratory
- Keep
- Haunted Quarter
- Great Wall
- Magic School
- Imperial Treasury
- Map Room
- University
- Dragon Gate

✅ Port target: add ALL SP districts (including uniques) to engine’s district deck.

### Unique building abilities (purple)
SP implements/talks about these behaviors (need to exist in engine):
- **Observatory**: when drawing cards, draw 3 instead of 2.
- **Library**: keep all drawn cards (no choose-1 modal).
- **Smithy**: pay 2g → draw 3.
- **Laboratory**: discard 1 district from hand → gain 1g.
- **Graveyard**: after a district is destroyed, owner may pay 1g to recover it.
- **Keep**: Keep itself can’t be destroyed (doesn’t protect other districts).
- **Haunted Quarter**: counts as any color for 5-color bonus.
- **Great Wall**: (SP has it listed; verify exact rule implementation).
- **Magic School**: (SP has it listed; verify exact rule implementation).
- **Imperial Treasury / Map Room / University / Dragon Gate**: (SP has them listed; verify scoring rules implementation).

✅ Port target: implement each unique exactly once in engine.

### Action/move surface (SP reducer action types)
SP actions observed (23):
- START_GAME, ADD_PLAYER, ADD_BOT, REMOVE_PLAYER
- PICK_ROLE, START_NEW_ROUND, START_ACTION_PHASE
- TAKE_GOLD, DRAW_CARDS_START, KEEP_CARD, CANCEL_DRAW
- BUILD_DISTRICT, END_TURN
- ACTIVATE_ABILITY, RESOLVE_INTERACTION
- USE_SMITHY, USE_LAB_START, USE_LAB_DISCARD
- END_GAME_SCORING
- CLEAR_TOAST, CLEAR_SFX, CLEAR_THIEF_PAYOUT, CLEAR_WARLORD_DESTROY

✅ Port target: map/merge these into boardgame.io moves + phases cleanly.

## Concrete tasks (ordered)
1) ✅ **Copy district list**: add missing districts to engine’s `DISTRICTS` with ids/costs/colors.
   - Done: `45321fb`
2) **Scoring rules**: port SP end-game scoring (incl. uniques + 5-color bonus + 8-district bonus if used).
3) **Purple uniques**:
   - ✅ Observatory: draw 3 instead of 2 (`796e242`)
   - ✅ Library: keep all drawn immediately (`796e242`)
   - ⏳ Smithy (pay 2 → draw 3)
   - ⏳ Laboratory (discard 1 → +1g)
   - ⏳ Graveyard (pay 1 → recover destroyed)
   - ⏳ Keep (immune)
   - ⏳ Haunted Quarter + scoring uniques (Imperial Treasury/Map Room/University/Dragon Gate/Great Wall/Magic School)
4) **Ability flows**: ensure Assassin/Thief/Magician/Warlord flows match SP behavior.
5) **Deck/discard rules**: district discard pile + reshuffle semantics match SP.
6) **Bot parity**: port SP bot heuristics into engine bot module.

## Current known issues (must fix for parity)
- **Images missing in desktop MP UI**: engine districts/roles currently lack `img` fields; UI expects `card.img`.
- **Round reset broken**: end-of-round should transition back to `draft` (roles reset), but action sequencing gets stuck.
- Server log seen: `ERROR: invalid move: drawCards args:` (likely UI calling move with wrong signature / wrong phase gating).

## Verification (manual)
Use the same smoke script after each port:
- Start game (4p), complete draft, enter action.
- Take gold, draw cards (with/without Observatory/Library), build district.
- Trigger: Assassin kill, Thief steal, Magician swap, Warlord destroy (including Keep protection).
- Trigger: Graveyard recovery decision.
- Finish game → verify scoring + bonuses.

(We’ll add automated tests later; this file is the human checklist.)
