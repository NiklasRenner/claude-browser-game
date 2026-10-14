# QuestForge

A modern take on the classic turn-based browser RPG (in the spirit of AdventureQuest), rendered with three.js.

Pick a class, take quests from the town board, and fight your way through four areas. Each ends in a boss. Exploit elemental weaknesses, manage HP/MP between fights, level up, spend stat points, and buy better gear.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 with live reload
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (esbuild), rebuilds and reloads on change |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` at http://localhost:4173 |
| `npm run typecheck` | Strict TypeScript check of everything |
| `npm test` | Unit, property/fuzz, playthrough and golden tests (~4 s) |
| `npm run test:e2e` | Builds, then drives the real UI in headless Chromium; screenshots in `test-results/` |
| `npm run test:update-golden` | Re-record golden files after an *intentional* gameplay change |
| `npm run sim` | Balance report: the bot plays full games for every class (`npm run sim -- 100` for more seeds) |
| `npm run check` | typecheck + tests + e2e (run before committing) |

The e2e test needs a Playwright Chromium (`npx playwright install chromium` once).

## Gameplay

- **Classes:** Warrior (STR, most HP), Mage (INT, spells never miss, fragile), Rogue (DEX, high crit, poison).
- **Loop:** Town → Quest board → 3 encounters + boss → back to town. HP carries over between fights, so potions, retreating and the inn matter.
- **Elements:** physical, fire, ice, energy, light, darkness, poison. Monsters show their weaknesses and resistances; buy weapons to exploit them, or swap weapons mid-battle (this costs your turn).
- **Status effects:** burn, poison, stun, chill (−accuracy), guard (−damage taken), evasive.
- **Progression:** XP levels grant 4 stat points; skills unlock by level; defeat costs 10% gold.
- **Saves:** autosaved to `localStorage` after every action; *Continue* on the title screen.
- **Keys:** Battle `A` attack · `1–9` skills · `F` flee · `Esc` back. Quest `Enter` continue · `R` retreat.

## Architecture

```
src/
  core/            Pure, deterministic game rules. No DOM, no three.js.
    types.ts       All state / action / event types (plain JSON data)
    data/          Content tables: classes, items, spells, monsters, areas
    game.ts        Reducer: step(state, action) → { state, events } + legalActions()
    combat.ts      Hit/crit/damage formulas, status effects, turn sequencing
    player.ts      Derived stats, XP curve, level-ups, inventory
    save.ts        Versioned save format with validation and migrations
    bot.ts         Autoplayer used by tests, the balance sim and __qf.botStep()
    describe.ts    Events → readable log lines (UI log and golden transcripts)
    rng.ts         Seeded PRNG; its state lives inside GameState
  game/controller.ts  Holds live state, dispatches, autosaves, feeds the animator
  render/          three.js stage: procedural models, environments, effects, tweens
  ui/ui.ts         DOM HUD and menus; buttons enabled exactly when legalActions allows
tests/             node:test suites (run via tsx) + golden files
scripts/           build, dev server, e2e, sim, golden updater
```

Key design rules:

1. **All game logic lives in `src/core` and is pure.** `step()` never mutates its input; every random roll comes from `state.rng`. The same seed and actions always give the same result, and a save/load continues identically.
2. **One source of truth for legality.** `checkAction()` and `legalActions()` are used by the reducer, the UI, the bot and the fuzz tests. Illegal actions return the unchanged state plus an `error` event, never an exception.
3. **Rendering only reacts.** The reducer emits events (`attack`, `statusApplied`, `levelUp`, …). The stage animates them and the UI re-renders from state. If WebGL is unavailable the game still works.

## Testing strategy

- **Unit tests** for formulas, statuses (e.g. "a 3-turn guard covers exactly 3 enemy turns"), shop, quest flow and saves.
- **Fuzz tests:** 40 seeds × 1500 random (partly garbage) actions, asserting invariants after every step: no softlocks, HP/MP/gold in bounds, mode consistency, rejected actions don't change state, and every state survives save/load.
- **Playthrough tests:** the bot must finish the whole game with every class.
- **Golden tests** (`tests/golden/`): exact seeded transcripts and bot summaries. Any change to formulas, content or turn order shows up as a readable diff. If the change was intended, run `npm run test:update-golden` and review `git diff tests/golden`.
- **E2E** (`scripts/e2e.mjs`): real clicks through title → town → battle, a 400-action bot run through the real UI and renderer, a HUD/state sync check, a non-blank canvas check, reload/continue, a mobile layout check, and zero console errors.

The browser build exposes `window.__qf` (`state`, `legal()`, `dispatch(action)`, `botStep()`, `speed(n)`) for debugging and tests.

## Adding content

- **New monster:** add it to `src/core/data/monsters.ts` and list it in an area. `look` picks a procedural body (`blob`, `beast`, `humanoid`, `flyer`, `golem`, `dragon`, `wraith`).
- **New item or spell:** add it to `items.ts` / `spells.ts`. Shop stock is everything with a price above 0.
- **New area:** add it to `areas.ts` with `requires` pointing at the previous area, then add a backdrop case in `src/render/environment.ts`.

`validateContent()` (run by the test suite) catches broken references. Then run `npm run sim` to check balance and `npm run test:update-golden` to accept the new behaviour.
