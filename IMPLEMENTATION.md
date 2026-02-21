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

### Not implemented (spec drafted 📝)

- persona_7 (p7) — Каспаров
  - timing: on_enter
  - effect: When you play Каспаров into any coalition, choose any one coalition (yours or an opponent’s). Then choose two personas in that coalition and swap their positions.
  - UX: After placement, prompt current player to select a coalition owner, then highlight personas in that coalition and let them click exactly two to swap. If a coalition has fewer than 2 personas, show it as disabled.
  - notes/edge-cases: Swapping affects adjacency-based abilities (e.g. persona_1/19/42/18); no immediate re-trigger unless we add a generic “on_reposition” hook later. Cannot choose the same persona twice.

- persona_8 (p8) — Лазерсон
  - timing: response (triggered)
  - effect: While Лазерсон is in your coalition, whenever another player plays a persona into their coalition, you may swap Лазерсон with that newly played persona.
  - UX: When an opponent successfully plays a persona into their coalition (after its on_enter resolves), if you have Лазерсон in your coalition, show you a modal: “Use Лазерсон to swap with <persona>?” If confirmed, move Лазерсон into that coalition at the new card’s position and move the other persona into your coalition at Лазерсон’s previous position.
  - notes/edge-cases: Only triggers if Лазерсон is currently in your coalition, and only for personas entering other players’ coalitions (not your own). One trigger per persona play. If multiple valid Лазерсон copies ever exist, each may trigger separately.

- persona_9 (p9) — Пономарёв
  - timing: on_play
  - effect: Пономарёв must be played into an opponent’s coalition instead of your own. When you play him, choose an opponent; Пономарёв enters that opponent’s coalition.
  - UX: When you choose to play Пономарёв, prompt “Choose opponent to receive Пономарёва”, then place the card into that opponent’s coalition (rightmost slot by default, or use placement UI if available).
  - notes/edge-cases: The card counts as part of the opponent’s coalition for VP and adjacency. Ownership for rules purposes is that coalition’s controller (same as other personas) unless we later add a “controller vs owner” distinction.

- persona_10 (p10) — Наки
  - timing: response (from hand)
  - effect: You may discard Наки from your hand to cancel any action or ability that targets a persona in your coalition (or your coalition as a whole).
  - UX: Whenever an action card or targeted persona ability is played that targets one of your personas or your coalition, and Наки is in your hand, show an interrupt prompt: “Discard Наки to cancel this effect?” If yes, discard Наки to the discard pile and cancel the pending effect (as if action_6/action_14 were used).
  - notes/edge-cases: Does not cancel global, non-targeted effects (e.g. “all players discard a card”). Works alongside other response cards; if multiple responses are available, follow existing response timing rules/priority.

- persona_11 (p11) — Соловей
  - timing: at_start_of_turn (optional trigger)
  - effect: At the beginning of your turn, before drawing, you may choose to skip drawing a card. If you do, discard Соловей from your coalition and then discard any one persona from an opponent’s coalition (except persona_31 / Шлосберг).
  - UX: At the start of the owning player’s turn, if Соловей is in their coalition, show a choice: “Use Соловей: skip draw to discard an opponent persona?” If accepted, highlight opponents’ coalitions with all valid targets (persona_31 greyed out / unselectable). Player picks a target; discard both Соловей and the chosen persona.
  - notes/edge-cases: This replaces your normal draw for the turn (no draw at all). If there are no valid opponent personas (everyone empty or only persona_31), do not offer the option.

- persona_12 (p12) — Савин
  - timing: on_enter
  - effect: When Савин enters your coalition, if at least one adjacent persona (left or right) has the `faction:red_nationalist` tag, that adjacent persona gains **2 × +1** tokens. If both neighbors qualify, you choose which one gets the bonus.
  - UX: After you place Савин and finalise his position, check neighbors. If there is exactly one red_nationalist neighbor, automatically put 2 × +1 tokens on it and log. If there are two, prompt you to choose which adjacent persona receives the tokens.
  - notes/edge-cases: Only checks immediate neighbors at the time of entering; moving cards later does not re-trigger this effect.

- persona_13 (p13) — Венедитков
  - timing: triggered (when targeted by opponent action)
  - effect: While Венедитков is in your coalition, whenever an opponent plays an action that targets you or any persona in your coalition, you place **1 × -1** token on any persona in that opponent’s coalition.
  - UX: After a qualifying opponent action resolves (and its target/effect is confirmed), if you have Венедитков, prompt you to select a persona in that opponent’s coalition and place 1 × -1 token on it. If there are no personas to target, show a small log note that the trigger fizzled.
  - notes/edge-cases: Triggers once per action card play (not per individual persona targeted inside that action). Affects the coalition of the player who played the action.

- persona_15 (p15) — Пожарский
  - timing: passive (linked to persona_22 / Светов)
  - effect: As long as Пожарский is in any coalition, whenever any persona_22 (Светов) in any coalition gains +1 or -1 tokens, Пожарский gains the same type of tokens plus one extra of that type. Example: if Светов gets 2 × +1, Пожарский gets 3 × +1; if Светов gets 1 × -1, Пожарский gets 2 × -1.
  - UX: This is automatic. When Светов receives tokens, also animate token gain on Пожарский and add a log entry linking the two effects.
  - notes/edge-cases: Triggers for any Светов on the table, in any player’s coalition. If multiple token events happen to Светов separately, each triggers separately. Does nothing if Светов is not in play.

- persona_16 (p16) — Кац
  - timing: on_enter
  - effect: When Кац enters your coalition, draw **3 cards** from the deck, then choose **3 cards** from your hand to discard (to the common discard pile). The discarded cards can include cards you just drew.
  - UX: After playing Кац, automatically draw 3 cards into your hand, then open a hand-selection UI requiring you to choose exactly 3 cards to discard. Confirm → move selected cards to discard and log the action.
  - notes/edge-cases: If the deck has fewer than 3 cards, draw as many as possible, then still ask you to discard up to that many cards (cannot discard more than current hand size). Кац stays in coalition and is not a discard candidate (already on board).

- persona_17 (p17) — Арно
  - timing: on_enter
  - effect: When Арно enters your coalition, choose an opponent. That opponent reveals their entire hand to you; then you choose one **persona** card from that hand and take it into your own hand.
  - UX: After placement, prompt you to choose an opponent. Then show that opponent’s hand fan to you (with personas visually distinguished from events/actions). Let you click one persona card to steal; that card is removed from opponent’s hand and added to yours, with a log entry.
  - notes/edge-cases: If the chosen opponent has no persona cards in hand, the effect fizzles after revealing (you see they have no personas; nothing is taken). Only personas are eligible targets.

- persona_18 (p18) — Соболь
  - timing: passive (adjacency-based VP modifier)
  - effect: Соболь’s effective VP is reduced by **3** for each adjacent persona in your coalition with the `faction:fbk` tag (left and/or right neighbors). Max reduction is -6 if both neighbors are FBK.
  - UX: Show Соболь’s VP as base 5 plus token modifiers plus a live adjacency modifier (e.g. via tooltip or small icon) so players can see the current penalty. Recompute whenever the coalition order changes.
  - notes/edge-cases: Only immediate neighbors count; having other FBK personas further away does nothing. If she has no adjacent FBK personas, there is no penalty.

- persona_20 (p20) — Быков
  - timing: on_enter
  - effect: When Быков enters your coalition, take any 1 card from the common discard pile into your hand.
  - UX: After placement, open a discard-pile picker UI (paged if needed) showing all cards in discard. Let the player select one card; that card moves from discard into their hand. If discard is empty, show a short log “Быков: no cards in discard to take”.
  - notes/edge-cases: Can take any card type (persona, action, event). Taking a card may affect future effects that depend on discard contents.

- persona_31 (p31) — Шлосберг
  - timing: passive
  - effect: Шлосберг cannot be removed from your coalition by any effect: not sent to discard, and not cleared by action_7 or similar removal effects.
  - UX: Mark Шлосберг with a “cannot be removed” icon/tooltip. When a removal effect attempts to target him, either do not allow targeting, or show a message “Шлосберг cannot be removed” and skip that target.
  - notes/edge-cases: Still can receive VP tokens (+/-). Effects that mention “discard any persona” should treat Шлосберг as an invalid target.

- persona_45 (p45) — Шульман
  - timing: on_enter
  - effect: When Шульман enters your coalition, choose an opponent. Randomly select one card from that opponent’s hand and add it to your hand.
  - UX: After placement, prompt you to choose an opponent; then, without revealing their full hand, randomly pick one card and animate it moving to your hand. Log that a random card was taken from that opponent.
  - notes/edge-cases: If the chosen opponent has an empty hand, the effect fizzles (log only).
---

## Spec template (fill per card)
When you send effects, I’ll rewrite each entry in this format:

- <card_id> — <short name>
  - timing: on_draw | on_play | response | on_enter | passive
  - effect: <plain English>
  - UX: <what the UI must prompt/allow>
  - notes/edge-cases: <limits, targeting rules, cleanup>
