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
- Day/night, weather, rent pressure, energy, money, relationships, and cultivation must influence one another.
- Random events and story events are data-driven. Do not hard-code event stories inside React components.
- Event content lives under `src/game/` event-definition modules and is composed by the event engine. React only renders definitions and dispatches choices.
- Event eligibility uses conditions plus weights. Recent events should be suppressed to avoid obvious repetition.
- NPC relationships must remember choices through serializable relationship state and story flags. Important choices may permanently close or redirect later branches.
- Relationship routes are not required to become romance. Friendship, mentor/peer, family-like bonds, partnership, estrangement and solitude are valid outcomes.
- Normal delivery gameplay must be able to open supernatural, relationship, and cultivation content.
- The game is single-player and local-first. A backend or AI service must never be required for core play.
- Save data is stored in IndexedDB and must carry a version field for future migrations.
- Randomness must be derived from the save-state seed so a save remains reproducible enough to debug.
- UI components render state and issue actions; simulation rules live under `src/game/`.

## AI narrative rules

- AI is an optional narrative enhancement layer only. The deterministic engine owns stats, time, relationship values, flags, route locks and endings.
- Never embed provider API secrets in the Web bundle, IndexedDB save, source code, or GitHub Pages configuration.
- Browser builds may call a configured server-side relay through `VITE_NARRATIVE_AI_ENDPOINT`; the relay owns provider credentials and policy.
- Send only minimal game context required for the current fictional scene. Do not send unrelated user/device/browser data.
- AI output may add short dialogue, reactions or atmosphere. It must not directly mutate game state or decide success/failure.
- AI requests must time out and fail silently back to authored content. Offline play remains complete.
- Authored story beats, branch conditions and endings remain playable and understandable without AI-generated text.

## Engineering rules

- TypeScript strict mode stays enabled.
- Keep the core engine deterministic and side-effect free; persistence and optional network narrative calls belong in adapters/store glue.
- Clamp player stats and relationship stats after effects so saves cannot drift into invalid values.
- Preserve mobile usability at 320px width.
- Run `npm run build` before merging.

## Delivery workflow

Use a feature branch, open a pull request, verify the build, then squash-merge to `main`. GitHub Pages deployment is driven from `main` by `.github/workflows/pages.yml`.
