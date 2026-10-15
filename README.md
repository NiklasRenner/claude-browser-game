# Starward (working title)

A turn-based sci-fi RPG in the spirit of classic browser RPGs like AdventureQuest, rendered with three.js. The setting is an original, Star Trek-inspired one: you serve aboard the exploration vessel *Meridian*.

Pick a division, take missions from the ship's board, beam down and fight through four worlds, each ending in a priority target. Exploit damage-type vulnerabilities, manage HP/energy between fights, level up, spend stat points, and requisition better gear.

The repository is still called `questforge`; the in-game title is set in `src/ui/ui.ts` (`GAME_TITLE`) and `public/index.html`.

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
| `npm run sim` | Balance report: the bot plays full games for every class, then runs patrols at several levels and post-game (`npm run sim -- 100` for more seeds) |
| `npm run check` | typecheck + tests + e2e (run before committing) |

The e2e test needs a Playwright Chromium (`npx playwright install chromium` once).

## Gameplay

- **Divisions:** Security Officer (STR, most HP), Science Officer (INT, field-science abilities never miss, fragile), Engineer (DEX, high crit, corrosive nanites).
- **Loop:** Ship → Mission Board → beam down → hostile contacts + a priority target → beam back up. HP carries over between fights, so medkits, returning to the ship and sickbay matter.
- **Missions:** Veridia Prime (jungle colony) → Kethra Mining Moon (volcanic) → Glacies IV (ice world) → The Void Rift (derelict fleet) → Xenith Hive World (5 contacts fought in packs, and the Brood Matriarch with two escorts; the finale).
- **Patrols (random runs):** launch from the top of the Mission Board, any time. A patrol picks a random unlocked world and runs 4 random contacts (solo hostiles or packs of 2–3), then that world's priority target, sometimes with escorts. Every hostile is scaled to your level when the patrol starts (HP, damage, accuracy and rewards follow the story's own level curve; pack members are individually weaker). Patrols are repeatable, don't count as clearing missions, and stay a fair fight after the finale up to the level cap.
- **Multiple hostiles:** fights can have up to 3 hostiles. You attack your current target (shown on the status card, a ring and an arrow in the scene). Switch with `Tab` / `Shift+Tab`, by clicking a name in the target list, or by clicking the hostile itself; switching is free. When your target goes down, targeting moves to the next living hostile. Area abilities (marked ⇶ all: Suppressive Fire, Ion Storm, Cryo Grenade) hit every hostile. You can't beam out while a priority target is standing.
- **Selling:** everything sells for half its price, minimum 1 credit (so starter kit can be cleared out); equipped gear can't be sold.
- **Damage types:** kinetic, plasma, cryo, ion, photon, void, corrosive. Hostiles show what they're vulnerable to and what they resist; buy weapons to exploit that, or swap weapons mid-fight (costs your turn).
- **Status effects:** burn, corrode, stun, chill (−accuracy), shield (−damage taken), evasive.
- **Progression:** XP levels grant 4 stat points; abilities unlock by level; going down costs 10% credits.
- **Saves:** autosaved to `localStorage` after every action; *Resume duty* on the title screen. Older saves are migrated (see `src/core/save.ts`).
- **Keys:** Combat `A` attack · `1–9` abilities · `Tab`/`Shift+Tab` switch target · `F` beam out · `Esc` back. Between fights `Enter`/`Space` advance · `R` return to ship. Keys pressed during an animation are queued.

Naming note: internal identifiers are mechanical (`gold`, `mp`, `spells`, `areas`, `monsters`, mode `town`); the player-facing words (credits, energy, abilities, missions, hostiles, ship) live in UI text and content data.

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
    patrol.ts      Random level-scaled runs: lineups, scaling, rewards
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

The browser build exposes `window.__qf` (`state`, `legal()`, `dispatch(action)`, `botStep()`, `speed(n)`, `load(state)`, `hostileScreenPoint(slot)`) for debugging and tests. `load` jumps straight to any (validated) state, e.g. a specific fight.

## Adding content

- **New hostile:** add it to `src/core/data/monsters.ts` and list it in an area. `look` picks a procedural body (`blob`, `beast`, `humanoid`, `flyer`, `golem`, `dragon`, `wraith`).
- **New item or ability:** add it to `items.ts` / `spells.ts`. Weapons have a visual `style` (`melee` or `ranged`); the held model comes from `WEAPON_SHAPES` in `src/render/models.ts`. Quartermaster stock is everything with a price above 0.
- **New mission:** add it to `areas.ts` with `requires` pointing at the previous one, then add a backdrop case and lighting entry in `src/render/environment.ts`. For pack fights, list lineups (1–3 hostile ids) in `groups`, and escorts for the priority target in `bossAdds` (max 2; the boss stands between them).
- **Renaming content ids** breaks existing saves: bump `SAVE_VERSION` and add a migration in `src/core/save.ts` (see the v1 → v2 sci-fi migration).

`validateContent()` (run by the test suite) catches broken references. Then run `npm run sim` to check balance and `npm run test:update-golden` to accept the new behaviour.
