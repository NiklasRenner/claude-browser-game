# Starward (working title)

A turn-based sci-fi RPG in the spirit of classic browser RPGs like AdventureQuest, rendered with three.js. The setting is an original, Star Trek-inspired one: you serve aboard the exploration vessel *Meridian*.

Pick a division, take missions from the ship's board, beam down and fight through five worlds, each ending in a priority target. Exploit damage-type vulnerabilities, manage HP/energy between fights, level up, spend stat points, and requisition better gear.

The repository is still called `questforge`; the in-game title is set in `src/ui/views/title.ts` (`GAME_TITLE`) and `public/index.html`.

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
| `npm run typecheck` | Strict TypeScript check of everything (incl. unused locals/parameters) |
| `npm run lint` | Typecheck + dead exports + layering rules (`scripts/lint.ts`, built on the TypeScript compiler) |
| `npm test` | Unit, property/fuzz, playthrough and golden tests (~4 s) |
| `npm run test:e2e` | Builds, then drives the real UI in headless Chromium; screenshots in `test-results/` |
| `npm run test:update-golden` | Re-record golden files after an *intentional* gameplay change |
| `npm run gallery` | Renders every officer kit and hostile side by side to `test-results/gallery.png` (`npm run gallery -- heroes` / `hostiles` for one group). Use it after changing models |
| `npm run sim` | Balance report: full bot playthroughs per class, patrols at several levels and post-game, and **stat weights** (`npm run sim -- 100` for more seeds) |
| `npm run check` | lint + tests + e2e (run before committing) |

The e2e test needs a Playwright Chromium (`npx playwright install chromium` once).

## Gameplay

- **Divisions:** Security Officer, Science Officer and Engineer differ only in their ability kits and starting gear. Stats are generic and shared.
- **Stats** (`src/core/stats.ts`, every officer starts at 5 in each; +4 points per level). Each has one job:
  **Power** → all damage (weapons, abilities, damage over time) · **Speed** → how often you act (diminishing; +10% takes 8 points) · **Intellect** → max energy · **Endurance** → max HP · **Luck** → crit chance (diminishing; crits deal ×2).
- **Turn order is a deterministic timeline.** Every combatant waits `100 / speed` between turns and whoever is due first acts (ties: you, then hostiles in lineup order). At equal speed turns simply alternate; at speed 110 against 100 you get 11 turns for every 10 of theirs, i.e. a double turn on a fixed beat roughly every 10 rounds. Fast hostiles (Hive Drones, Phase Wisps) can open a fight before you act and sometimes act twice. No dice are involved, so the battle screen shows the next 8 turns (»You marks a turn you get again before anyone else). Armor can add or cost speed (Thermal Envirosuit +4%, Aegis Power Armor −4%).
- **Player evasion is gear, not a stat:** fixed amounts from armor and abilities (Holo-Decoy), capped at 40 in total. Hostile evasion is not capped.
- **Hit chance is gear, not a stat.** Every weapon, ability and hostile attack has its own hit chance (◎), and the defender's evasion is subtracted from it (final chance clamped to 5–100%, one rule for both sides). Values above 100 still matter: they keep landing against evasive targets. Weapons and abilities can strike several times (×N), each strike rolling hit, crit, damage and procs on its own, so a 3-shot 71% flechette pistol plays very differently from a 59% mass driver. Weapon techniques (Overcharge, Exploit Weakness…) use the weapon's hit and strikes, plus their own accuracy modifier. In battle, chips show the real chance against the current target.
- **Hostiles have combat profiles** (`src/core/data/hostiles.ts`): HP, accuracy, evasion, crit and resistances, authored directly in those output units. The player's diminishing curves are only the price list for turning stat points into those numbers, so hostiles aren't bound by them: the Phase Wisp has 70 evasion and 34 HP, the Tundra Brute hits hard but only has 78 accuracy. Hostiles also have a speed (80 for a lumbering Magma Colossus, 130 for a Phase Wisp). Patrol scaling raises accuracy by 0.5 per level. The target card shows the current hostile's speed, evasion and chance to hit you.
  You recover 15% of max energy after each won fight. The Personnel File shows what each stat currently gives.
- **Loop:** Ship → Mission Board → beam down → hostile contacts + a priority target → beam back up. HP carries over between fights, so medkits, returning to the ship and sickbay matter.
- **Missions:** Veridia Prime (jungle colony) → Kethra Mining Moon (volcanic) → Glacies IV (ice world) → The Void Rift (derelict fleet) → Xenith Hive World (5 contacts fought in packs, and the Brood Matriarch with two escorts; the finale).
- **Patrols (random runs):** launch from the top of the Mission Board, any time. A patrol picks a random unlocked world and runs 4 random contacts (solo hostiles or packs of 2–3), then that world's priority target, sometimes with escorts. Every hostile is scaled to your level when the patrol starts (HP, damage, accuracy and rewards follow the story's own level curve; pack members are individually weaker). Patrols are repeatable, don't count as clearing missions, and stay a fair fight after the finale up to the level cap.
- **Multiple hostiles:** fights can have up to 3 hostiles. You attack your current target (shown on the status card, a ring and an arrow in the scene). Switch with `Tab` / `Shift+Tab`, by clicking a name in the target list, or by clicking the hostile itself; switching is free. When your target goes down, targeting moves to the next living hostile. Area abilities (marked ⇶ all: Suppressive Fire, Ion Storm, Cryo Grenade) hit every hostile. You can't beam out while a priority target is standing.
- **Selling:** everything sells for half its price, minimum 1 credit (so starter kit can be cleared out); equipped gear can't be sold.
- **Damage types:** kinetic, plasma, cryo, ion, photon, void, corrosive. Hostiles show what they're vulnerable to and what they resist; buy weapons to exploit that, or swap weapons mid-fight (costs your turn).
- **Damage types and their effects.** Each damage type has one associated effect that its weapons, abilities and hostile attacks *can* carry (with a chance; never guaranteed, and never another type's effect, `validateContent` enforces it). Kinetic has none for now:

  | Type | Effect | What it does |
  | --- | --- | --- |
  | plasma | Burn | Heavy damage every turn, short (2 turns); a new burn replaces the old one |
  | corrosive | Corrode | Poison: lighter damage every turn for longer (4 turns), and each new dose stacks, up to 3× |
  | cryo | Chill | Slowed: −25–30% speed, so turns come later on the timeline |
  | ion | Stun | Skips the next turn |
  | photon | Blind | −hit chance |
  | void | Exposed | Takes extra damage from everything |

  Statuses work the same on both sides. Abilities also give shield (−damage taken), evasive (+evasion) and marked (−evasion). Chips and tooltips name each effect and its strength (`src/core/data/effects.ts`).
- **Level gap:** your hit chance drops 10% per level a hostile is above you (no bonus below). Escape chance is 60% at equal level, ±12% per level of difference (5–95%), plus a little from speed; the Beam out button shows it. Story bosses fight at the mission's recommended level + 1 (`bossLevel` on a mission overrides it).
- **Progression:** XP levels grant 4 stat points; abilities unlock by level; going down costs 10% credits.
- **Saves:** autosaved to `localStorage` after every action; *Resume duty* on the title screen. Saves are versioned (see `src/core/save.ts`); the history was reset at version 1, so pre-reset saves no longer load.
- **Keys:** Combat `A` attack · `1–9` abilities · `Tab`/`Shift+Tab` switch target · `F` beam out · `Esc` back. Between fights `Enter`/`Space` advance · `R` return to ship. Keys pressed during an animation are queued.

Naming: code uses the same words as the game (divisions, credits, energy, abilities, missions, hostiles, the ship). The repository name `questforge` is the only leftover.

## Architecture

```
src/
  core/            Pure, deterministic game rules. No DOM, no three.js.
    types.ts       All state / action / event types (plain JSON data)
    data/          Content tables: divisions, items, abilities, hostiles, missions (+ validateContent)
    stats.ts       Stat formulas and every balance knob
    game.ts        Reducer: step(state, action) → { state, events }
    rules.ts       checkAction() / legalActions() and read-only queries (prices, unlocks)
    flow.ts        Mission flow: starting fights, victory rewards, defeat, mission/patrol completion
    combat/        battle.ts (helpers, statuses) · formulas.ts (hit, evasion, damage) ·
                   timeline.ts (speed turn order) · actions.ts (attacks, abilities, items) ·
                   round.ts (sequencing a round)
    player.ts      Derived stats, XP curve, level-ups, inventory
    patrol.ts      Random level-scaled runs: lineups, scaling, rewards
    save.ts        Versioned save format with validation and migrations
    describe.ts    Events → log lines with a tone (UI log and golden transcripts)
    bot.ts         Autoplayer used by tests, the balance sim and __qf.botStep()
    rng.ts         Seeded PRNG; its state lives inside GameState
  game/            controller.ts (live state, dispatch, autosave, animator hook);
                   elements.ts (colours/icons shared by UI and stage)
  render/          three.js stage (bloom post-processing), environments, effects, tweens;
                   models/ (procedural figures: builder, hero, weapons, creatures, beings)
  ui/              ui.ts (input + UI-only state) · views/ (title, ship, mission: state → HTML) ·
                   widgets.ts (chips) · html.ts (helpers) · keys.ts (keyboard bindings)
tests/             node:test suites (run via tsx) + golden files
scripts/           build, dev server, e2e, sim, golden updater
```

Key design rules:

1. **All game logic lives in `src/core` and is pure.** `step()` never mutates its input; every random roll comes from `state.rng`. The same seed and actions always give the same result, and a save/load continues identically.
2. **One source of truth for legality.** `checkAction()` and `legalActions()` are used by the reducer, the UI, the bot and the fuzz tests. Illegal actions return the unchanged state plus an `error` event, never an exception.
3. **Rendering only reacts.** The reducer emits events (`attack`, `statusApplied`, `levelUp`, …). The stage animates them and the UI re-renders from state. If WebGL is unavailable the game still works. The UI and the stage never import each other (`npm run lint` checks this).
4. **Views are functions.** Each view takes state (plus the UI-only bits it needs, like the open tab) and returns HTML; the `UI` class only handles input and decides what to render. Log text and its tone (good/bad/loot) come from core events, never from matching strings.

## Testing strategy

- **Unit tests** for formulas, statuses (e.g. "a 3-turn guard covers exactly 3 enemy turns"), shop, quest flow and saves.
- **Fuzz tests:** 40 seeds × 1500 random (partly garbage) actions, asserting invariants after every step: no softlocks, HP/MP/gold in bounds, mode consistency, rejected actions don't change state, and every state survives save/load.
- **Playthrough tests:** the bot must finish the whole game with every class.
- **Golden tests** (`tests/golden/`): exact seeded transcripts and bot summaries. Any change to formulas, content or turn order shows up as a readable diff. If the change was intended, run `npm run test:update-golden` and review `git diff tests/golden`.
- **E2E** (`scripts/e2e.mjs`): real clicks through title → ship → battle, a 400-action bot run through the real UI and renderer, a HUD/state sync check, a non-blank canvas check, reload/continue, a mobile layout check, and zero console errors.

The browser build exposes `window.__qf` (`state`, `legal()`, `dispatch(action)`, `botStep()`, `speed(n)`, `load(state)`, `hostileScreenPoint(slot)`) for debugging and tests. `load` jumps straight to any (validated) state, e.g. a specific fight.

## Balancing

`npm run sim` ends with a **stat-weights** table: for bot characters at levels 5, 10 and 15, it adds +5 points to one stat at a time, replays the same missions 300 times and reports how much each point raises a combat score:

    score = (damage dealt per turn) × max HP ÷ (damage taken per turn)     ≈ "damage per turn × effective HP"

Aim for every stat in roughly the same band (currently about 1–4% per point). Speed is the deliberate exception late on (≈0.5–1% at level 15): its curve is steep on purpose so double turns stay rare. If one stat dominates or one is near zero, adjust its knob in `src/core/stats.ts` and re-run. The campaign and patrol tables above it show the overall difficulty (deaths per playthrough / per patrol).

## Adding content

- **New hostile:** add it to `src/core/data/hostiles.ts` and list it in a mission. `look` picks a procedural body plan (`blob`, `beast`, `brute`, `humanoid`, `husk`, `elemental`, `flyer`, `golem`, `serpent`, `dragon`, `insect`, `wraith`, `wisp`), colours, a scale and optional `features` (e.g. `helmet`, `shield`, `blade`, `spikes`, `wings`, `crown`). Check it with `npm run gallery`.
- **New item or ability:** add it to `items.ts` / `abilities.ts`. Weapons have a visual `style` (`melee` or `ranged`); the held model comes from `SHAPES` in `src/render/models/weapons.ts`. Quartermaster stock is everything with a price above 0.
- **New mission:** add it to `missions.ts` with `requires` pointing at the previous one (the last one sets `FINAL_MISSION` and a `finale`), then add a backdrop case and lighting entry in `src/render/environment.ts`. For pack fights, list lineups (1–3 hostile ids) in `groups`, and escorts for the priority target in `bossAdds` (max 2; the boss stands between them).
- **Renaming content ids** breaks existing saves: bump `SAVE_VERSION` and add a migration to `MIGRATIONS` in `src/core/save.ts`.

`validateContent()` (run by the test suite) catches broken references. Then run `npm run sim` to check balance and `npm run test:update-golden` to accept the new behaviour.
