# Politikum — State

**Status:** playable MP MVP with lots of rules + UX implemented; still in “papercuts / stability” phase.

## Repos / Paths
- **Engine (shared):** `/home/clop/citadel/citadel-engine`
  - Game logic: `src/politikum.ts`
  - Abilities: `src/politikum/abilities.ts`
  - Card defs (source of truth): `src/politikum/cards.yaml` → generated `src/politikum/cards.generated.ts`
- **App (UI+server):** `/home/clop/citadel/politikum/app`
  - UI: `src/multiplayer/SpineUI.jsx`
  - Server: `src/multiplayer/Server.js` (port **8001**)
  - Vite dev UI: **5177**

## Running (LAN)
- UI: `http://192.168.8.14:5177/`
- Server: `http://192.168.8.14:8001/`

## Ops notes (important)
- **Vite can die** with: `Failed to load url .../citadel-engine/dist/index.js` when the engine `dist/` is missing.
  - Fix: `cd ~/citadel/citadel-engine && npm run build` then restart Vite.
- **Server does NOT hot-reload engine dist.** Any engine change requires `npm run build` in engine + restart `Server.js`.
- We agreed: **batch log-only tweaks** and restart server only when explicitly requested or a rules/softlock fix demands it.

## Lobby
- In-engine lobby phase (add/remove bots, set player name, start game).
- **Max seats:** 5.
- Game can start with **2+ active players**.
- Lobby chat: `G.chat` + `submitChat` move; UI renders chat + input.

## Turn / rules (current)
- Must **Draw** before **Play**; must **Play** before **End Turn**.
- Optional **2nd draw**: drawing a second card ends the turn immediately.
- Events resolve immediately on draw (can chain).
- Game ends when any player reaches **7 coalition cards**; end-of-round logic now counts **active seats only**.
- VP = sum of coalition `vp` (base + tokens + passive deltas).

### Response windows
- Response system: `G.response` with ~10s window.
- UI center-table prompt with hotkeys:
  - `1` = use A6/A8/A14 (as applicable)
  - `2` = skip response (server move `skipResponseWindow`)
  - `3` = p8 swap (when available)

## Bots
- Bot actions are driven by `tickBot` (pacing) and should resolve their own pendings to avoid stalls.
- Known fixes shipped:
  - bots auto-resolve token placement pendings (event_10 stall)
  - bots handle p26 (auto-skip if no targets)
  - bots handle p37 bribe/silence with prioritization (queued)

## UX highlights shipped recently
- Opponent fans always fan-able; backs non-interactive; center-origin zoom.
- Placement UX:
  - “ghost placement mode” auto-triggers for position-sensitive personas: p1/p12/p18/p19/p25/p42.
- p16 discard-3: click-to-select in hand + Confirm button (no prompt modal).
- p14 discard-any: **no modal**; click any table persona to discard.
- Game over screen: score chart + final coalitions shown as **fan stacks flanking the chart**; hide empty seats.

## Persona implementation status
- Remaining not-✅ (as of now): **p11, p13, p17**.

## Known pain points / next fixes
- Occasional gateway/server/Vite crashes → “refused to connect” + missing engine dist.
- `invalid stateID ... tickBot` spam after disconnect/desync: long-term fix is likely **server-side bot runner**.
