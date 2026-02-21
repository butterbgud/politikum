# Politikum — Card implementation status

Source of truth for card list: `citadel-engine/src/politikum/cards.yaml`

Legend:
- ✅ implemented end-to-end (engine + UI)
- 🟡 implemented but missing UX polish / missing some edge-cases
- ❌ not implemented
- 📝 spec drafted (needs sanity check)

## Important note (spec source)
Right now **cards.yaml mostly lacks rules text** for non-implemented cards.
So for the remaining (❌) cards, the “spec” below is **placeholder** until we copy the actual card text/intent.

If you want me to draft real effects, I need at least one of:
- the card’s written description (like you’ve been sending), or
- screenshots of the card faces, or
- a typed list of effects.

---

## Events
### Implemented
- event_1 ✅ place **3 × +1** tokens on any coalition personas (choose targets)
- event_2 ✅ place **2 × +1** tokens on any coalition personas (choose targets)
- event_3 ✅ place **5 × +1** tokens on any coalition personas (choose targets)

### Not implemented (needs spec)
- event_10 ❌ 📝 TBD (need card text)
- event_11 ❌ 📝 TBD (need card text)
- event_12a ❌ 📝 TBD (need card text)
- event_12b ❌ 📝 TBD (need card text)
- event_12c ❌ 📝 TBD (need card text)
- event_15 ❌ 📝 TBD (need card text)
- event_16 ❌ 📝 TBD (need card text)

## Actions
### Implemented
- action_4 ✅ choose opponent → they discard **1 coalition card** of their choice
- action_5 ✅ this turn: you may play up to **2 personas**; each played persona gets **-1 VP** token
- action_6 ✅ response: cancel an action (discard both)
- action_8 ✅ response: cancel a persona play (persona goes to discard)
- action_9 ✅ choose opponent → they discard **1 persona** from coalition (persona-only)

### Not implemented (needs spec)
- action_7 ❌ 📝 TBD (need card text)
- action_13 ❌ 📝 TBD (need card text)
- action_14 ❌ 📝 TBD (need card text)
- action_17 ❌ 📝 TBD (need card text)
- action_18 ❌ 📝 TBD (need card text)

## Personas
### Implemented
- persona_14 (Roizman) ✅ on enter: discard **any** coalition persona (any player)
- persona_40 (Duncova) ✅ on enter: place **3 × +1** tokens on any coalition personas (choose targets)

### Not implemented (needs spec)
- persona_1..45 (except 14, 40) ❌ 📝 TBD (need each card’s ability text)

---

## Spec template (fill per card)
When you send effects, I’ll rewrite each entry in this format:

- <card_id> — <short name>
  - timing: on_draw | on_play | response | on_enter | passive
  - effect: <plain English>
  - UX: <what the UI must prompt/allow>
  - notes/edge-cases: <limits, targeting rules, cleanup>
