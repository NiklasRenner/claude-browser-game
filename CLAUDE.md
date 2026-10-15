# Working on Starward (repo: questforge)

Read README.md for architecture. The short version:

- Game rules live only in `src/core` (pure, deterministic, no DOM). Rendering (`src/render`) and UI (`src/ui`) only react to state and events.
- Never add game logic to the UI or renderer. If the UI needs to know whether something is allowed, use `checkAction` / `legalActions`.
- Every random roll must go through the `Rng` seeded from `state.rng`. Never use `Math.random()` in `src/core`.
- Keep modules small and single-purpose (see the architecture tree in README.md): new rules go in the matching `src/core` file, new screens in `src/ui/views/`. Don't re-add exports nothing uses.

## Feedback loop

1. `npm run lint`: typecheck (incl. unused code) + dead exports + layering rules. Fix everything it reports.
2. `npm test`: fast (~4 s). Golden failures mean behaviour changed. If intended, run `npm run test:update-golden` and review the diff.
3. `npm run sim`: after any balance or content change. Every class should still complete, with a sensible death count, and the stat-weights table should stay roughly even (no stat near 0 or far above the rest).
   All stat formulas and knobs are in `src/core/stats.ts`.
4. `npm run test:e2e`: after UI or renderer changes. Look at the screenshots in `test-results/`.

When adding a mechanic, add a unit test for its exact semantics and make sure the fuzz test's invariants still cover it.

## Setting

Original sci-fi setting inspired by Star Trek (exploration starship, away missions, divisions). Keep it original: no names, terms, logos or ship designs from Star Trek or other franchises (e.g. no "Starfleet", "phaser", "tricorder", delta insignia, LCARS-style UI).
