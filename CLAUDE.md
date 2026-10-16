# Working on Starward (repo: questforge)

Read README.md for architecture. The short version:

- Game rules live only in `src/core` (pure, deterministic, no DOM). Rendering (`src/render`, a 2D canvas) and UI (`src/ui`) only react to state and events.
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

Original setting: a Star Trek-like premise (exploration starship, away missions, divisions) in a dark, dystopian, gothic and slightly magical look, in the mood of Warhammer 40k. Keep it original: no names, terms, logos, iconography or designs from Star Trek, Warhammer or other franchises (e.g. no "Starfleet", "phaser", "tricorder", delta insignia, LCARS-style UI, "Space Marine", "Imperium", aquila, servo-skulls, purity seals).

Art is 2D pixel art drawn in code (see "Art" in README.md). After changing sprites run `npm run gallery` and look at `test-results/gallery*.png`; after changing backdrops or the stage, run `npm run scene` (the location alone, `test-results/scene-*.png`) and `npm run test:e2e` (with figures and UI, the `mission-*.png` screenshots) and look at both. Where set pieces stand is in `src/render/scenes/layouts.json`, which the user also edits with the scene editor (`/editor.html` on `npm run dev`): read it fresh before changing positions, and keep its one-line-per-piece format.
