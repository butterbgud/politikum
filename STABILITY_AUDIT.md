# Politikum — Stability Audit (pending/response)

Goal: make the game un-wedgeable.
Policy: every `pending.kind` must be resolvable.

For each pending kind ensure:
- no-target check ⇒ auto-skip (don’t create pending)
- explicit Cancel/Skip path (UI + server move)
- bot auto-resolve path
- pending never blocks endTurn forever

## Pending kinds (from engine `src/politikum.ts`)
- action_13_shield_persona
- action_17_choose_opponent_persona
- action_18_pick_persona_from_discard
- action_4_discard
- action_7_block_persona
- action_9_discard_persona
- discard_one_persona_from_any_coalition
- event_12b_discard_from_hand
- event_16_discard_self_persona_then_draw1
- persona_11_offer
- persona_11_pick_opponent_persona
- persona_13_pick_target
- persona_16_discard3_from_hand
- persona_17_pick_opponent
- persona_17_pick_persona_from_hand
- persona_20_pick_from_discard
- persona_21_pick_target_invert
- persona_23_choose_self_inflict_draw
- persona_26_pick_red_nationalist
- persona_28_pick_non_fbk
- persona_32_pick_bounce_target
- persona_33_choose_faction
- persona_34_guess_topdeck
- persona_37_pick_opponent_persona
- persona_39_activate
- persona_3_choice
- persona_45_steal_from_opponent
- persona_5_pick_liberal
- persona_7_swap_two_in_coalition
- place_tokens_plus_vp
- resolve_persona_after_response

## Response windows
- cancel_action (A6/A14/p10)
- cancel_persona (A8 + p8 swap)

## Changes log

### 2026-02-23
- Engine: implemented `maybeResolveDeferredPersona(G)` and wired it into `endTurn` + `drawCard`.
  - Fixes `resolve_persona_after_response` softlocks where the response window ended but pending still blocked play.
- Engine: action_8 cancel now clears a matching `resolve_persona_after_response` pending (ability will not fire after cancel).
- Engine: added generic `moves.cancelPending()` (allowlist) for most choice pendings.
- UI: Esc now also calls `moves.cancelPending()` when the pending belongs to you.

## Next implementation steps
1) Add a generic engine move: `cancelPending()` with allowlist of cancellable kinds.
2) Add per-kind no-target checks on creation (many already exist; verify all).
3) Add bot resolvers for any remaining human-only pendings.
4) Consider server-side bot ticking (authoritative) to remove client timing wedges.
