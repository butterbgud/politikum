# Tournament v1 checklist (progress is computed)

**DoD v1:** admin can create/open/close/cancel tournaments; players can join/leave; round 1 seating generated & visible; per-table match can be created; players can click into their match.

## Server / DB
- [x] SQLite tables: tournaments / tournament_players / tournament_rounds / tournament_tables
- [x] Public endpoints: list + get
- [x] Join/leave endpoints (auth)
- [x] Admin endpoints: create/open/close/cancel
- [x] Admin endpoint: generate round 1 tables
- [ ] Admin endpoint: list tournament tables/round state (or include in tournamentGet)
- [ ] Admin endpoint: create match for a table (writes match_id)

## UI (public)
- [x] `/#/tournament` list
- [x] `/#/tournament/:id` detail
- [x] Join/leave buttons
- [ ] Show generated round/tables + seats on detail page
- [ ] Table card: "Open match" when match exists

## UI (admin)
- [x] Route `/#/admin/tournament`
- [x] Create tournament
- [x] Status buttons: open/close/cancel
- [x] Button: generate round 1
- [ ] Show round1 tables count + quick view
- [ ] Button per table: create match

## Recent shipped (notes)
- [x] Admin UI: Generate R1 wired to backend + better error reporting
- [x] DB: added indexes for tournament tables/rounds/players (performance groundwork)

## Auth/ops
- [x] Beta login works (BETA_PASSWORDS: polarbearorchard,11,22,33,44)
- [x] Document canonical ports/URLs
  - UI (vite dev): http://localhost:5176/ (LAN: http://192.168.8.14:5176/)
  - API: http://localhost:8000/

## Progress formula
Progress% = checked_items / total_items.

