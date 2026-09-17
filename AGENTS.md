# Daoist-Delivery Agent Rules

This repository is a single-player Web RPG about delivering food by day and cultivating immortality by night.

## Read before modifying

Read this file, `docs/GAME_DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/PLAY_MODES.md`, `docs/MAP_INTERFACE.md`, `docs/CULTIVATION.md`, then directly affected code. Call out conflicts before implementation. The v0.3 dual-mode design intentionally extends the earlier short-dialogue-only AI policy at the user's request.

## Non-negotiable game rules

- Game time advances only through player actions, never a wall-clock tick. Every gameplay action has an explicit cost in minutes. UI settings, start-menu navigation and save selection cost no time. Story mode is selected only when creating a save; no runtime mode switch is allowed.
- Day/night, weather, rent, energy, money, relationships and cultivation influence one another.
- Authored events and NPC branches remain data-driven under `src/game/`; never write story logic in React.
- Event selection uses eligibility, weights and recent-event suppression. Delivery can open supernatural and relationship content.
- Preserve serializable NPC memories, relationship metrics, flags and route locks. Romance is not the default destination: friendship, peers, family-like bonds, partnership, estrangement and solitude remain valid.
- Core play never requires AI or a backend. Classic mode must issue zero AI requests, including after NPC choices, reloads and switching save slots.
- Core rule randomness comes from saved seeds. AI scene text is external content, saved before choices and reused without rerolling on reload.
- Preserve the v2 world (with additive versioned vehicle and player-position data) inside the v5 session envelope; migrate legacy v1/v2/v3/v4 saves without clearing progress. Preserve the original autosave as a backup and migrate it exactly once into an independent slot. Reject unknown future save versions rather than silently overwriting them.
- UI renders state and dispatches commands. Pure simulation and session transitions live in `src/game/`; network and storage remain adapters.

## Dual-mode AI rules

- Classic / generative saves share the same engine and ending rules, but each slot has its own world, history and immutable creation-time mode.
- AI may generate bounded side scenes, dialogue, 2–4 choices and outcome prose. It cannot return executable effects, arbitrary stats, world flags, route changes or ending IDs.
- Each generated choice references an allowlisted local action profile; the engine owns costs, effects, resource requirements, relation deltas and all canonical decisions. Always supply a resource-free exit with an explicit time cost.
- Generated social scenes are limited to already-known, non-estranged NPCs. Never force romance or bypass authored route locks.
- Require mode selection and consent before sending minimal fictional context. Never send the whole save, unrelated logs, real personal data or browser/device details.
- Never embed model-provider keys in source, Vite variables, Pages or browser storage. A relay owns provider secrets; an optional relay access token is session-memory-only.
- Require safe endpoint URLs, bounded JSON, strict output validation, timeouts and visible authored fallback. Do not claim AI success on mock, fallback or unconfigured services.
- Abort requests and invalidate stale results on slot changes, menu return and config changes. Handle double clicks, pending saves, reloads and out-of-order writes. Do not charge twice on fallback.
- AI prose may be imperfect; canonical story beats, route conditions, numeric results and endings remain understandable and playable without it.

## Engineering and delivery

- TypeScript strict mode stays enabled. Clamp stats and relationship values.
- Preserve 320px mobile usability and keyboard-accessible controls.
- Test classic zero-network behavior, scene validation, save migration, cancellation, fallback, resource costs and relay boundaries.
- Run `npm test`, `npm run build` and browser tests before merging. Use mocked providers in tests; never require or spend production credentials in CI.
- Work on a feature branch, open a PR, verify CI, squash-merge to `main`, then verify GitHub Pages deployment. Never report deployment complete based only on a queued workflow.

## Map interface

- Keep the map as the default main view, persistent top status and bottom-left navigation. Map browsing is UI only, never a gameplay action.
- Preserve all classic/generative, NPC, ending and recovery controls in accessible panels; never hide pending events or save errors without a recovery entry point.
- Map geometry is local and fictional. No map tiles, geolocation, or implied free travel. Delivery lines are schematic, not real-time navigation. The player marker is the saved last confirmed location; only a successful riding/pushing delivery moves it to the destination.

## Vehicles and automatic saves (v0.5)

- Riding requires positive battery and condition AND enough of both for the full order. Reject before RNG, clock, reward or order mutations. Pushing is an explicit, slower stamina-paid action, never an automatic ride fallback.
- Speed, battery, durability and efficiency upgrades have bounded levels, local costs and explicit time. Higher capacity must work in all clamps, displays, event effects and charging.
- Always enter through the start page. Create and open independent slots; gameplay cannot run before selecting one. There is no manual save action.
- Capture slot identity for queued saves and AI tickets. Write transactions must check revision and immutable mode; never silently overwrite another tab, an unknown future schema, or an unreadable save.
- Surface autosave progress/failure globally. Retry transient errors automatically and do not silently leave an unsaved game. Require explicit user confirmation to discard only the unsaved in-memory changes.

## Expanded delivery atlas (v0.6)

- `deliveryLocations.ts` owns the 2400×1600 atlas, 24 pickup / 40 dropoff IDs and versioned player-position validation. IDs are durable save identifiers; never rename or reuse them.
- Only the active order renders pickup/dropoff markers and its route. Delivery-only stops must not appear in permanent `MAP_PLACES` or its directory; functional landmarks remain accessible.
- Commit the destination in the pure engine only after delivery succeeds, before any post-delivery event. Previewing/rejecting a map task, cancelling a legacy active order, browsing, panning and zooming do not move the player; a successful direct map delivery does. An aborted/fatal delivery cannot claim arrival.
- Retain `game.position` inside the v5 session envelope (v0.8 extends v0.6). Missing legacy positions start at the station; do not invent historical coordinates or regenerate active orders. Preserve old address lookup and all prior progress. Reject unknown position schemas without overwriting saves.
- Each slot persists its own position automatically. Camera focus is temporary UI state and follows the restored/updated player; locating a marker is not a travel action. Do not send position data to AI or add real-time ticks.

## Cultivation and camera (v0.8)

- The user-approved scope extends the realm cap to foundation entry (`realmLevel = 10`) and upgrades the envelope to v5. `docs/CULTIVATION.md` owns the exact costs, recipes and trial rules. Large sect management, active travel and combat remain deferred.
- One active manual, independent mana, bounded inventory/proficiency/preparation, per-bottleneck experience and a serializable inner trial live in `game.cultivation`. Never reduce old realms or require old saves to repeat novice teaching. Unknown schemas, IDs or incomplete v5 data must be protected.
- Retain each original pre-v5 slot once under `backup:pre-v5:<id>` in the same transaction as its first upgraded write. Never overwrite a backup. The original legacy autosave remains preserved separately.
- Preview is free and RNG-free. Pay costs before advancing time, stop at fatal midnight, and do not reward after death. Long meditation settles per hour and stops at an authored event without charging unplayed hours. Trial choices are stage-bound, saved before the next choice; all other gameplay is locked during a trial, with a resource-free timed retreat.
- Main-manual effects do not stack. Light steps consume mana and only reduce fatigue on two successful rides; riding still requires the full battery and wear costs. Switching manuals cancels remaining light steps.
- The map controller owns transforms and pointer capture outside the game store. RAF is rendering only, never a gameplay tick. Zoom anchors at the cursor/pinch centroid; handle pinch-to-drag, cancellation, click suppression and keyboard access. Map-only touch capture must not disable browser zoom globally or capture panel scrolling.
- Manual panning/gesture navigation suspends follow; Locate Player resumes it. Read/slot restore initially focuses the player. Camera state is temporary and does not enter saves or AI context. Existing task-only delivery markers and fixed gameplay modes remain unchanged.

## Map-first delivery board (v0.9, overrides the v0.6 marker flow)

- When no order is active and gameplay is not blocked by a pending story/trial/generated scene, the map shows a small deterministic set of available delivery task markers. A task marker represents the whole pickup-and-delivery job and is anchored at its delivery destination; pickup is no longer a separate player step or map marker.
- Clicking a task marker is a free preview. It must show merchant, destination, distance, expected time/reward and the current ride battery/durability requirements before execution. The action button is “配送”: there is no separate acceptance transition or acceptance time cost. Clicking “配送” settles that exact visible offer immediately using the normal delivery time/resource/reward rules and must not reroll into a different order.
- Available tasks are derived locally from the saved world state and remain stable while the world is unchanged. Any successful player action that changes the world/time refreshes the unaccepted task set. Browsing, panning, zooming, opening/closing panels and reloading the same unchanged save do not refresh it.
- New map tasks do not create an intermediate active order: successful “配送” completes pickup and dropoff in one action, updates the rider position, writes the log and refreshes the board. Existing active orders restored from older saves remain recoverable through the delivery panel. The old non-map “接一个新订单” UI must not be an alternate path.
- Existing vehicle checks, pushing/cancel recovery, successful-arrival position commit, autosave, event, classic/generative and migration rules remain authoritative. Task-board candidates are derived UI/gameplay state, not a new save schema, and are never sent to AI.
