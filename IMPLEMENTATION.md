# Politikum — Card implementation status

Source of truth for card list: `citadel-engine/src/politikum/cards.yaml`

Legend:
- ✅ implemented end-to-end (engine + UI)
- 🟡 partial / stub (wired but effect incomplete)
- ❌ not implemented

## Events
- event_1 ✅ (place 3 × +1 tokens on your coalition)
- event_2 ✅ (place 2 × +1 tokens on your coalition)
- event_3 ✅ (place 5 × +1 tokens on your coalition)
- event_10 ❌
- event_11 ❌
- event_12a ❌
- event_12b ❌
- event_12c ❌
- event_15 ❌
- event_16 ❌

## Actions
- action_4 ✅ (target opponent → they discard 1 coalition card)
- action_5 ✅ (this turn: play up to 2 personas, each -1 VP)
- action_6 ✅ (response: cancel an action)
- action_7 ❌
- action_8 ✅ (response: cancel a persona play)
- action_9 ❌ (needs spec: “discard opponent persona” flow)
- action_13 ❌
- action_14 ❌
- action_17 ❌
- action_18 ❌

## Personas
- persona_14 ✅ (on enter: discard any coalition persona)
- persona_40 ✅ (on enter: place 3 × +1 tokens on your coalition)
- others ❌ (no abilities yet)

Notes:
- “Implemented” means: rules effect works, UI prompts exist, log entries are sane.
- If a card is wired in YAML with `abilityKey` but has no logic, mark it 🟡.
