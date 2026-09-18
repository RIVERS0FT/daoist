# Architecture v0.13

## Stack and module boundaries

React + strict TypeScript + Vite + Zustand + IndexedDB + local SVG/CSS. GitHub Actions builds and deploys the static app to Pages. A separate Node relay is optional; classic gameplay requires no backend or model service.

- `types.ts`, `engine.ts`: the v2 world plus versioned vehicle, position and cultivation data; deterministic actions, one game clock, resource limits, vehicles and authored events.
- `deliveryBoard.ts`: derived deterministic delivery candidates for the current world and exact one-action map delivery dispatch; there is no separate acceptance transition. It does not add a save schema and never sends candidate data to AI.
- `cultivation.ts`: manuals, items, recipes, preparation, breakthrough previews/settlement and the inner foundation trial.
- `system.ts`: deterministic delivery-coin rewards, instant exchange catalog, authored system chapters, missions, achievements and fixed rewards. It reuses cultivation item IDs and namespaced `game.flags` claim markers, never advances the clock, never moves the player and never depends on React or AI.
- `events.ts`, `deliveryEvents.ts`, `npcEvents.ts`, `content.ts`, `npcs.ts`, `endings.ts`: data-driven story choices, delivery-specific multi-choice encounters, relationship routes, eligibility, weights, repeat suppression and canonical endings. No story rules in React.
- `generation.ts`, `play.ts`: allowlisted AI action profiles, strict scene validation, authored fallback, session transitions, memories and migration.
- `store.ts`: the only UI write entry. Owns slot identity, pending locks, request cancellation and serial autosave. Map offer execution enters through `deliverDeliveryOffer(offerId)`; `cultivate` waits for the preceding save before accepting another costly command.
- `storage.ts`: IndexedDB transactions, revision/mode checks, migration backups and transaction-completion acknowledgement.
- `deliveryLocations.ts`: stable delivery/functional location IDs, local atlas coordinates and position validation; `cityMap.ts`: permanent functional landmark presentation.
- `travel.ts`: canonical map-distance math, current-position travel plans, action/NPC/exploration destinations and delivery route distance. It is local, deterministic and never accesses network/geolocation.
- `mapCamera.ts`, `map/controller.ts`: pure camera math and a DOM pointer/transform controller, respectively. Neither writes gameplay state.
- `App.tsx` and panels: accessible views and command dispatch. Cultivation has its own panel, while generated scenes remain in `PlayModePanel`. `CityMap` renders derived delivery offers and free previews; it does not generate canonical world effects itself.

## Persistence and migrations

Current format:

```ts
PlaySession = { version: 5, game: GameState /* v2 + bike + position + cultivation + deliveryCoins */, play: PlayState }
SaveSlot = { version: 1, id, name, createdAt, updatedAt, revision, session: PlaySession }
```

The database stays `daoist-delivery`, version 1, object store `saves`; slots use `slot:<id>`. The envelope version is separate from the world version. v1/v2 raw worlds migrate to classic sessions; v3/v4 preserve their mode, scenes, memories and progress. v5 requires valid cultivation data and a valid fixed mode. Unknown future versions, malformed counters, unknown stable IDs or unsupported realm levels are rejected without overwriting originals.

Delivery-board candidates are intentionally not persisted. They are a pure local derivation from canonical world state. The same unchanged saved world therefore reconstructs the same visible tasks after reload, while a successful action that changes time/history/world state yields a new candidate set. Existing save versions do not change for v0.9.

The first legacy import atomically creates `slot:legacy-autosave` and `meta:legacy-import`; the original `autosave` remains untouched. Before the first write upgrading an existing pre-v5 slot, the same transaction adds its exact raw record at `backup:pre-v5:<id>` if absent, then writes the upgraded slot. Later writes never overwrite this backup. Unknown slots remain visible as protected entries.

Old worlds retain money, time, RNG seed, orders, vehicle upgrades, location, NPC relationships, flags and endings. Missing `deliveryCoins` migrates additively to 0; a present balance must be a bounded non-negative safe integer or the save is rejected rather than normalized silently. Missing positions start at the station, never a guessed historical address. Missing cultivation gets the baseline manual with proficiency appropriate to the existing realm; no rare items or invented history. Stable IDs must never be renamed or reused. The v5 envelope causes older clients to reject new data rather than silently discard fields.

Each state transition captures the slot ID and queues a write. Every transaction checks the expected revision and immutable story mode, preventing delayed writes or another tab from overwriting newer progress. A save is successful only after transaction completion; database connections close afterward. Temporary errors retry automatically with a global warning. Conflicts/future schemas stop writing. Returning to the start page waits for pending saves; unsaved memory changes may be discarded only after explicit confirmation, without deleting disk data.

## Session, simulation and AI lifecycle

The start page is mandatory. Only `newGame(name, mode)` chooses classic/generative mode; there is no runtime switching API. Each slot owns its independent world. Browsing menus and previewing a delivery task do not advance game time. All actual gameplay uses the store, with shared locks for authored events, generated scenes, pending requests, game over and the inner trial.

Exploration pays 15 minutes and 2 energy before requesting a scene. Classic mode selects a seeded authored scene with recent suppression and makes zero AI calls. Generative mode requires explicit consent and a configured safe relay. `validateScene` accepts only bounded prose and 2–4 distinct allowlisted approaches and adds a resource-free timed exit. AI cannot write stats, items, routes, flags, ending IDs or player positions. Scene choices are persisted before use and settle only once. Reloading a paid pending request uses authored fallback without recharging or automatically requesting again. Full scenes and the latest 12 resolved memories are saved.

The network gate combines AbortController and revision tickets. Menu return, slot changes or configuration changes abort pending work and invalidate late results; a result must match both slot and request ID. HTTP timeouts are 20 seconds, responses at most 32 KiB, no automatic network retries, no redirecting tokens, credentials omitted and no referrer. All model prose renders as text. Fallback is visibly authored, never labelled model success.

The relay owns provider keys, upstream URL, authentication, exact allowed origins, concurrency and budgets. Browser settings contain only public relay URL and consent; the optional access token stays in page memory. Neither save data nor source contains provider credentials. Minimal fictional requests contain time/weather/realm, optional known non-estranged NPC context and recent scene memories, never coordinates, cultivation inventory, full logs, delivery-board candidates or real personal information. v0.8 only expands the relay's allowed realmLevel to 10; an old relay rejecting foundation requests still leads to visible authored fallback.

## Delivery cultivation system

`completeDelivery` is the only delivery settlement point that grants delivery coins, so map one-action jobs, restored legacy jobs and explicit pushing share one rule. Reward is deterministic from the committed order: `min(4, 1 + floor(distanceKm / 3) + strangeBonus)`. Coins are awarded only after delivery time completes and survival is confirmed, alongside money, order count and position; rejected, cancelled or fatal attempts receive none.

`system.ts` owns the exchange catalog, unlock counts, inventory-cap checks and settlement. `store.ts.exchangeSystemItem(id)` is the only UI write entry and persists through the normal serial autosave. Each valid exchange pays coins before advancing five game minutes; if the shared clock ends the run during that time, no item is awarded. The exchange catalog only grants existing cultivation inventory IDs and cannot change routes, flags, realm or AI state.

Delivery coins are intentionally excluded from `NumericStatKey`, AI profiles and generation payloads. Neither authored event effects nor model output can mint or spend them.

## Cultivation and time

`game.cultivation` version 1 stores bounded manual proficiency, one active manual ID, mana, preparation, per-bottleneck failure experience, inventory, medicine-use day/count, two-ride light-step charges and inner-trial stage/composure/result. AI has no authority over these values.

Previews do not mutate state or consume RNG. Validate requirements and pay costs before advancing time, then check survival before awarding results. The shared clock stops on a fatal midnight. Long meditation settles per hour, computes phase-weighted gains using actual game minutes, and stops on an authored event without paying for remaining hours. `runCultivationAction` injects the existing weighted event selector at checkpoints. There is no real-time tick or offline production.

The inner trial is not travel or combat. Its stage-bound choices persist before the next decision; stale repeated choices do nothing. Other gameplay and AI exploration remain locked, with a five-minute resource-free retreat. Success unlocks a separate foundation breakthrough rather than granting a realm or repeatable item reward. Main-manual effects do not stack, and light steps reduce fatigue only: all electrical and durability thresholds still apply.

## Delivery geography and map interface

The fictional atlas is 2400×1600 with 24 pickup, 40 dropoff and 10 functional landmark coordinates. Orders preserve stable pickup/dropoff IDs and existing address text. Old names still resolve deterministically; unknown old text has a safe location fallback. Atlas coordinates are now the canonical source for gameplay distance, while rendered route lines remain schematic and are not claimed to be street-by-street navigation.

When there is no active order and gameplay is not blocked, `deliveryBoard.ts` derives four deterministic candidates from the current canonical world. Each candidate still contains merchant/pickup and customer/dropoff data, but the map renders one task marker at the delivery destination. Clicking it is a free UI preview. Pressing “配送” sends the exact visible offer ID through the store and immediately settles that delivery using normal delivery time/resource/reward rules; there is no separate acceptance time or intermediate `activeOrder`, and the order is never rerolled after the player commits. The task markers themselves are the only idle execution entry; there is no duplicate idle map card.

The task board is stable while canonical world state is unchanged. Panning, zooming, opening panels and reloading do not consume RNG or refresh it. Effective actions alter world time/history/state and therefore produce a new board the next time offers are available. Pending authored events, generated scenes, the inner trial and game over suppress offers.

New map tasks complete in one settlement and therefore do not render an intermediate pickup/dropoff route. Their canonical distance is `current player -> pickup -> dropoff`; this live route drives delivery minutes, battery/wear requirements, fatigue and distance-based rewards. Existing active orders restored from older saves use the same live route with stable/fallback address resolution. Successful delivery commits the dropoff after survival checks; preview, rejection and cancellation do not move the player.

Ten functional landmarks remain permanent and are opened directly from the atlas; the main map has no separate “地点” button. Clicking a landmark is still free. Once a physical action is executed, `engine.ts`/`play.ts` use `travel.ts` to add commute minutes from the saved current position, commit the functional destination on arrival, then settle the authored local action duration. Same-location actions have zero commute. System exchange/mission/achievement operations bypass `travel.ts` entirely and are instantaneous remote state transitions. Delivery addresses remain separate from the permanent landmark list. The city heading is reduced to `青岚市`; the old view menu is removed. Top status and bottom-left navigation remain visible. The navigation dock itself is transparent and the atlas DOM/paint area extends behind it, while camera math uses a bottom safe area so automatic positioning does not intentionally place important markers under the navigation. Non-modal panels have their own scroll area and preserve keyboard focus on close/Escape. Pending stories and inner trials reopen when restored and remain reachable after closing the panel. Save errors are global, never hidden behind an AI panel. No map network requests, GPS or provider keys are introduced.

## Camera lifecycle

A local controller owns `{x, y, scale}`, pointer records, original capture targets and gesture baselines. One rendering-only RAF paints the world transform and inverse-scales HTML markers to preserve touch target sizes. React controls update at gesture end or after a wheel idle period, not on every pointer movement.

Zoom anchors the map coordinate under the cursor or pinch centroid. Pinching uses both distance and midpoint movement; returning to one pointer rebases against the current transform. Mouse/touch thresholds distinguish dragging from clicking. Drag clicks are suppressed, while keyboard activation remains available. Pointer cancellation, capture loss, blur, hidden pages, slot changes and unmount clear state. There is no rotation or added inertia.

Only the map surface sets `touch-action: none` and uses a non-passive wheel handler. Panels keep normal scrolling and browser page zoom is not globally disabled. Wheel input zooms around the pointer; ctrlKey pinch still zooms. Pure functions implement bounded transforms, a safe-area-aware dynamic full-atlas minimum scale, a 2× maximum and route fitting. The persistent visible controls are a single horizontal row containing zoom in, zoom out and Locate Player; the flag/Locate Delivery Destination control is removed; arrows, +/- and Home remain keyboard alternatives. No user-visible camera preference or direction-button menu is required.

Player restore starts focused and following. Manual gestures, wheel zoom or keyboard panning pause follow; Locate Player resumes it. Gameplay arrival moves the camera only while following. Camera state is temporary, not saved, and cannot alter game time, RNG or position.

## Verification and delivery

Travel regression covers map-distance monotonicity, zero same-location commute, functional-position persistence, current→pickup→dropoff delivery distance and life/social/cultivation arrivals. System regression covers zero-time/zero-position exchange, chapter unlocks, one-time task/achievement claims, hidden achievement gating, inventory caps, legacy migration and autosave persistence. Delivery-event regression validates unique IDs, at least three branches per new event, branch-specific effects, requirements, canonical registration and browser choice rendering.

Run `npm test` for compiled game/store/relay tests, `npm run build` for strict production output, and `npm run test:e2e` for desktop/mobile Chromium plus cultivation/gesture/delivery-board flows on mobile WebKit. Test real IndexedDB, exact old-slot backups, slot isolation, saved trials, exact one-action map delivery, task refresh after actions, AI cancellation, classic zero-network behavior and no-cost camera interactions. Native CDP touch injection is Chromium-only; WebKit pointer tests are not a claim of physical iPhone/Safari testing. AI tests use mock providers, never production credentials.

CI archives only tracked source and also uploads production dist and browser reports/screenshots. Work on a feature branch, open a PR, verify checks and screenshots, squash-merge, then verify completed GitHub Pages deployment for that merge SHA. Pages builds with Vite base `/Daoist-Delivery/`. Model relay deployment remains separate; successful static deployment is not evidence of real provider generation.
