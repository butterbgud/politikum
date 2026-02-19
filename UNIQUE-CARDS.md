# Citadel — Unique (purple) district abilities (standard rules)

This project implements Citadels-style unique district rules.

## Implemented uniques (13 total)

### Draw/action modifiers
- **Library** — when taking the Draw Cards action, keep all drawn cards.
- **Observatory** — when taking the Draw Cards action, draw 3 instead of 2.
- **Smithy** — pay 2 gold to draw 3 cards (once per turn).
- **Laboratory** — discard 1 card from hand to gain 1 gold (once per turn).

### Warlord / destruction
- **Keep** — cannot be destroyed by the Warlord.
- **Great Wall** — Warlord pays +1 extra gold to destroy one of your districts.
- **Graveyard** — after one of your districts is destroyed by Warlord, you may pay 1 gold to recover the destroyed district card into your hand.

### Income modifier
- **Magic School** — counts as a district of the active role’s color for income (King/Bishop/Merchant/Warlord).

### Endgame scoring
- **Haunted Quarter** — may count as any color for the “all 5 colors” bonus.
- **Imperial Treasury** — +1 point per gold at end of game.
- **Map Room** — +1 point per card in hand at end of game.
- **University** — +2 points.
- **Dragon Gate** — +2 points.

## Notes
- `usedUniqueThisTurn` is reset at each role turn and at round start.
- Graveyard recovery is implemented via an interaction modal.
