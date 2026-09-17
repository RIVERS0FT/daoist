# Daoist-Delivery Agent Rules

This repository is a single-player Web RPG about delivering food by day and cultivating immortality by night.

## Read before modifying

1. Read this file.
2. Read `docs/GAME_DESIGN.md`.
3. Read `docs/ARCHITECTURE.md`.
4. Read the files directly affected by the change.

If a requested change conflicts with the design documents, call out the conflict before implementing it. Otherwise the design documents are authoritative.

## Non-negotiable game rules

- Game time advances only because the player performs an action. There is no real-time clock tick.
- Every meaningful action must have an explicit time cost in game minutes.
- Day/night, weather, rent pressure, energy, money, and cultivation must influence one another.
- Random events are data-driven. Do not hard-code event stories inside React components.
- Event eligibility uses conditions plus weights. Recent events should be suppressed to avoid obvious repetition.
- Normal delivery gameplay must be able to open supernatural/cultivation content.
- The game is single-player and local-first. No backend is required for core play.
- Save data is stored in IndexedDB and must carry a version field for future migrations.
- Randomness must be derived from the save-state seed so a save remains reproducible enough to debug.
- UI components render state and issue actions; simulation rules live under `src/game/`.

## Engineering rules

- TypeScript strict mode stays enabled.
- Keep the core engine deterministic and side-effect free; persistence belongs in `storage.ts` / store glue.
- Clamp player stats after effects so saves cannot drift into invalid values.
- New random events should be added to `src/game/events.ts` rather than branching in UI.
- Preserve mobile usability at 320px width.
- Run `npm run build` before merging.

## Delivery workflow

Use a feature branch, open a pull request, verify the build, then squash-merge to `main`. GitHub Pages deployment is driven from `main` by `.github/workflows/pages.yml`.
