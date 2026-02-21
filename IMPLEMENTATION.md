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
- event_10 ✅ place **4 × +1** tokens on any coalition personas (choose targets)
- event_11 ✅ draw **2 cards** from the deck (extra draws; events resolve immediately on chain-draw)
- event_12a ✅ all in-play personas with faction **FBK** get **1 × -1** token; then you draw **1 card** (tagged `event_type:twitter_squabble`)
- event_12b ✅ all **other players** discard **1 card from hand** (human players choose; bots auto-discard first card). Tagged `event_type:twitter_squabble`.
- event_12c ✅ all in-play personas with faction **liberal** get **1 × -1** token; then you draw **1 card** (tagged `event_type:twitter_squabble`)
- event_15 ✅ all cards in players' hands are shuffled together and redealt so everyone keeps the **same hand size**
- event_16 ✅ discard **1 persona from your coalition**, then draw **1 card**

### Not implemented (needs spec)
(none for events)

## Actions
### Implemented
- action_4 ✅ choose opponent → they discard **1 coalition card** of their choice
- action_5 ✅ this turn: you may play up to **2 personas**; each played persona gets **-1 VP** token
- action_6 ✅ response: cancel an action (discard both)
- action_8 ✅ response: cancel a persona play (persona goes to discard)
- action_9 ✅ choose opponent → they discard **1 persona** from coalition (persona-only)

### Newly implemented
- action_7 ✅ block abilities on a targeted persona; clear all VP tokens (vpDelta reset); leaves a persistent marker above that card.
- action_13 ✅ shield a persona in your coalition: it cannot be targeted by abilities/actions; when it would receive +1 tokens, it gets 1 fewer (to a minimum of 0); persistent shield marker.
- action_14 ✅ response: when an action (e.g. action_4/action_9) targets your coalition, you may play this to cancel that effect (and discard both cards).
- action_17 ✅ choose persona in an opponent coalition: it receives 2 × -1 tokens, or 4 × -1 if its base id is persona_3, persona_38, persona_41 or persona_43.
- action_18 ✅ return a persona from the shared discard pile to your hand.

## Personas
### Implemented
- p1 (persona_1 / Runov) ✅ on enter: if adjacent (L/R) to persona_19 or persona_42 → place **4 × +1** tokens on self. (Requires placement mode.)
- p2 (persona_2 / Serezhko) ✅ passive: **-1 VP per male** in your coalition (including itself if male).
- p3 (persona_3 / SVTV) ✅ on enter: gets **1 × -1** token, then choose:
  - (A) discard a **leftwing** persona (any coalition) to discard pile *(currently first-valid target; can upgrade to pick exact)*
  - (B) remove up to **2 × +1** tokens from all opponents’ **leftwing** personas
- p4 (persona_4 / Yashin) ✅ on enter: gets **2 × -1** per `twitter_squabble` event in discard; also whenever a `twitter_squabble` event is drawn → gets **2 × -1**.
- p5 (persona_5 / Pevchih) ✅ on enter: pick an opponent **liberal** persona → discard it; transfer all its tokens (+/-) onto Pevchih.
- p6 (persona_6 / Kashin) ✅ passive: whenever **action_8** is played → each Kashin in play gets **1 × +1** token.
- p19 (persona_19 / Girkin) ✅ on enter: if adjacent (L/R) to persona_1 or persona_42 → place **4 × +1** tokens on self.
- p42 (persona_42 / Strelkov) ✅ on enter: if adjacent (L/R) to persona_1 or persona_19 → place **4 × +1** tokens on self.
- persona_14 (Roizman) ✅ on enter: discard **any** coalition persona (any player)
- persona_40 (Duncova) ✅ on enter: place **3 × +1** tokens on any coalition personas (choose targets)

### Not implemented (needs spec)
- remaining personas ❌ / 📝 TBD

---

## Spec template (fill per card)
When you send effects, I’ll rewrite each entry in this format:

- <card_id> — <short name>
  - timing: on_draw | on_play | response | on_enter | passive
  - effect: <plain English>
  - UX: <what the UI must prompt/allow>
  - notes/edge-cases: <limits, targeting rules, cleanup>
