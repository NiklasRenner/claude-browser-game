# Starward (working title)

A turn-based sci-fi RPG in the spirit of classic browser RPGs like AdventureQuest, in dark 2D pixel art. The setting is an original one: a Star Trek-like premise (you serve aboard the exploration vessel *Meridian*) in a grim, gothic, slightly magical universe.

Enlist an officer, take missions from the ship's board, beam down and fight through five worlds, each ending in a priority target. Exploit damage-type vulnerabilities, manage HP/energy between fights, level up, spend stat points, and requisition better gear.

The repository is still called `questforge`; the in-game title is set in `src/ui/views/title.ts` (`GAME_TITLE`) and `public/index.html`.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 with live reload
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (esbuild), rebuilds and reloads on change; the scene editor at `/editor.html` saves through it |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` at http://localhost:4173 |
| `npm run typecheck` | Strict TypeScript check of everything (incl. unused locals/parameters) |
| `npm run lint` | Typecheck + dead exports + layering rules (`scripts/lint.ts`, built on the TypeScript compiler) |
| `npm test` | Unit, property/fuzz, playthrough and golden tests (~4 s, one process) |
| `npm run test:e2e` | Builds, then drives the real UI in headless Chromium; screenshots in `test-results/` |
| `npm run test:update-golden` | Re-record golden files after an *intentional* gameplay change |
| `npm run gallery` | Paints every officer kit and hostile side by side to `test-results/gallery.png` (`npm run gallery -- heroes` / `hostiles` for one group, `npm run gallery -- all 1.3 0.4` for everyone mid-attack). Use it after changing sprites |
| `npm run sim` | Balance report: full bot playthroughs, patrols at several levels and post-game, and **stat weights** (`npm run sim -- 100` for more seeds) |
| `npm run check` | lint + tests + e2e (run before committing) |

The e2e test needs a Playwright Chromium (`npx playwright install chromium` once).

## Gameplay

- **Enlisting:** every officer starts with the same gear (Mk I Sidearm, duty uniform) and 5 in each stat, plus 5 starting points, spread by default as Power +1, Intellect +1, Endurance +2, Luck +1 (Speed stays at base so everyone starts at speed 100). *Customize* on the title screen moves them; all 5 must be spent (`checkStart` in `player.ts`).
- **Abilities:** everyone learns Overcharge (level 1), Target Painter (3) and Combat Stim (5) for free. The other 16 are taught in the ship's **Scriptorium** tab (`shop: { level, price }` in `abilities.ts`), from Plasma Burst (level 1, ◈60) to Orbital Strike (level 12, ◈950); learned ones are kept in `player.learned` and listed after the level ones. Every ability has its own animation (`src/render/ability-fx.ts`): a cast on the officer (charging the weapon, a painting laser, a shield dome, a stim, welding sparks...), and its own way of striking (fireball, nanite swarm, freezing beam, lightning from above, a lobbed grenade, a column from orbit...). Shields, holo-decoys and target marks stay visible while they last. Up to 8 known abilities are taken into battle (the **loadout**, on keys 1–8, `player.loadout`); new ones join it while there's room, and the Locker tab swaps them (`slotAbility` / `unslotAbility`, outside battle). The Locker lists the loadout, the other abilities, then owned weapons, armor and supplies, cheapest first. (High-level specializations may come later.)
- **Energy:** 15 + 2 per level + 5 per point of Intellect (+ armor); the level part is small so Intellect is what buys more casts.
- **Stats** (`src/core/stats.ts`, base 5 in each, plus the starting points; +4 points per level). Each has one job:
  **Power** → all damage (weapons, abilities, damage over time) · **Speed** → how often you act (diminishing; +10% takes 8 points) · **Intellect** → max energy · **Endurance** → max HP · **Luck** → crit chance (diminishing; crits deal ×2).
- **Turn order is a deterministic timeline.** Every combatant waits `100 / speed` between turns and whoever is due first acts (ties: you, then hostiles in lineup order). At equal speed turns simply alternate; at speed 110 against 100 you get 11 turns for every 10 of theirs, i.e. a double turn on a fixed beat roughly every 10 rounds. Fast hostiles (Hive Drones, Phase Wisps) can open a fight before you act and sometimes act twice. No dice are involved, so the battle screen shows the next 8 turns (»You marks a turn you get again before anyone else). Armor can add or cost speed (Thermal Envirosuit +4%, Aegis Power Armor −4%).
- **Player evasion is gear, not a stat:** fixed amounts from armor and abilities (Holo-Decoy), capped at 40 in total. Hostile evasion is not capped.
- **Hit chance is gear, not a stat.** Every weapon, ability and hostile attack has its own hit chance (◎), and the defender's evasion is subtracted from it (final chance clamped to 5–100%, one rule for both sides). Values above 100 still matter: they keep landing against evasive targets. Weapons and abilities can strike several times (×N), each strike rolling hit, crit, damage and procs on its own, so a 3-shot 71% flechette pistol plays very differently from a 59% mass driver. Weapon techniques (Overcharge, Exploit Weakness…) use the weapon's hit and strikes, plus their own accuracy modifier. In battle, chips show the real chance against the current target.
- **Hostiles have combat profiles** (`src/core/data/hostiles.ts`): HP, accuracy, evasion, crit and resistances, authored directly in those output units. The player's diminishing curves are only the price list for turning stat points into those numbers, so hostiles aren't bound by them: the Phase Wisp has 70 evasion and 34 HP, the Tundra Brute hits hard but only has 78 accuracy. Hostiles also have a speed (80 for a lumbering Magma Colossus, 130 for a Phase Wisp). Patrol scaling raises accuracy by 0.5 per level. The target card shows the current hostile's speed, evasion and chance to hit you.
  You recover 15% of max energy after each won fight. The Personnel tab shows what each stat currently gives.
- **Loop:** Ship → Mission Board → beam down → hostile contacts + a priority target → beam back up. HP carries over between fights, so medkits, returning to the ship and sickbay matter.
- **Missions:** Veridia Fen (swamp colony taken by the Choir of the Sunken Engine) → Kethra Mining Moon (volcanic) → Glacies IV (ice world) → The Void Rift (derelict fleet) → Xenith Hive World (5 contacts fought in packs, and the Brood Matriarch with two escorts; the finale).
- **Patrols (random runs):** launch from the top of the Mission Board, any time. A patrol picks a random unlocked world and runs 4 random contacts (solo hostiles or packs of 2–3), then that world's priority target, sometimes with escorts. Every hostile is scaled to your level when the patrol starts (HP, damage, accuracy and rewards follow the story's own level curve; pack members are individually weaker). Patrols are repeatable, don't count as clearing missions, and stay a fair fight after the finale up to the level cap.
- **Combat drills (practice / testing):** at the bottom of the Mission Board, pick 1–3 of any hostiles in the game (bosses included, nothing needs to be unlocked) for a single fight on their home world. Hostiles fight at their own level, bosses at their story level. No XP, credits or drops; losing costs nothing, beaming out always works, and you're fully restored afterwards.
- **Multiple hostiles:** fights can have up to 3 hostiles. You attack your current target (shown on the status card, a ring and an arrow in the scene). Switch with `Tab` / `Shift+Tab`, by clicking a name in the target list, or by clicking the hostile itself; switching is free. When your target goes down, targeting moves to the next living hostile. Area abilities (marked ⇶ all: Suppressive Fire, Ion Storm, Cryo Grenade) hit every hostile. You can't beam out while a priority target is standing.
- **Selling:** everything sells for half its price, minimum 1 credit (so starter kit can be cleared out); equipped gear can't be sold.
- **Damage types:** kinetic, plasma, cryo, ion, photon, void, corrosive. Hostiles show what they're vulnerable to and what they resist; buy weapons to exploit that, or swap weapons mid-fight (costs your turn).
- **Damage types and their effects.** Each damage type has one associated effect that its weapons, abilities and hostile attacks *can* carry (with a chance; never guaranteed, and never another type's effect, `validateContent` enforces it). Kinetic has none for now:

  | Type | Effect | What it does |
  | --- | --- | --- |
  | plasma | Burn | Heavy damage every turn, short (2 turns); burns don't add up (the stronger and the longer one count) |
  | corrosive | Corrode | Poison: lighter damage every turn for longer (4 turns), and each new dose stacks, up to 3× |
  | cryo | Chill | Slowed: −25–30% speed, so turns come later on the timeline |
  | ion | Stun | Skips the next turn |
  | photon | Blind | −hit chance |
  | void | Exposed | Takes extra damage from everything |

  Statuses work the same on both sides. Burn and corrode damage grows with the attacker's damage (Power, or a patrol hostile's scaling); the other effects keep the strength they were made with. Every status's rules (name, what its power means, damage over time, stacking) are one row in `STATUSES` (`src/core/data/effects.ts`). Abilities also give shield (−damage taken), evasive (+evasion) and marked (−evasion). Chips and tooltips name each effect and its strength.
- **Level gap:** your hit chance drops 10% per level a hostile is above you (no bonus below). Escape chance is 60% at equal level, ±12% per level of difference (5–95%), plus a little from speed; the Beam out button shows it. Story bosses fight at the mission's recommended level + 1 (`bossLevel` on a mission overrides it).
- **Progression:** XP levels grant 4 stat points; abilities unlock by level; going down costs 10% credits.
- **Saves:** autosaved to `localStorage` after every action; *Resume duty* on the title screen. Saves are versioned (see `src/core/save.ts`); the history was reset at version 1, so pre-reset saves no longer load.
- **Keys:** Combat `A` attack · `1–8` abilities · `Tab`/`Shift+Tab` switch target · `F` beam out · `Esc` back. Between fights `Enter`/`Space` advance · `R` return to ship. Keys pressed during an animation are queued.

Naming: code uses the same words as the game (credits, energy, abilities, missions, hostiles, the ship). The repository name `questforge` is the only leftover.

## Architecture

```
src/
  core/            Pure, deterministic game rules. No DOM, no rendering.
    types.ts       All state / action / event types (plain JSON data)
    data/          Content tables: items, abilities, hostiles, missions; effects.ts (STATUSES: every
                   status's rules) (+ validateContent)
    stats.ts       Stat formulas and every balance knob (patrol scaling: patrol.ts)
    game.ts        Reducer: step(state, action) → { state, events }
    rules.ts       checkAction() / legalActions() and read-only queries (prices, unlocks)
    flow.ts        Runs (story, patrol, drill): newRun, who the next fight is against (lineupFor),
                   victory rewards, defeat, mission/patrol completion
    combat/        battle.ts (helpers, statuses) · formulas.ts (hit, evasion, damage) ·
                   timeline.ts (speed turn order) · actions.ts (attacks, abilities, items) ·
                   round.ts (sequencing a round)
    player.ts      Derived stats, XP curve, level-ups, inventory
    patrol.ts      Random level-scaled runs: lineups, scaling, rewards
    drill.ts       Combat drills: one practice fight against any picked lineup
    save.ts        Versioned save format (SAVE_VERSION) with validation and migrations
    describe.ts    Events → log lines with a tone (UI log and golden transcripts)
    bot.ts         Autoplayer used by tests, the balance sim and __qf.botStep()
    rng.ts         Seeded PRNG; its state lives inside GameState
  game/            controller.ts (live state, dispatch, autosave, animator hook);
                   elements.ts (colours/icons shared by UI and stage)
  render/          2D canvas stage (low-res, integer-scaled): stage.ts (sizing, frame loop, sync) ·
                   actor.ts (figures and their geometry, pure) · director.ts (plays a step's events) ·
                   markers.ts (shadows, target, shields, decoys) · bloom.ts · fx.ts (particles, bolts,
                   floating text; FX_COLORS) · ability-fx.ts (each ability's look) · tween.ts;
                   pixel/ (painter: shaded parts → outlined sprites; palette; noise);
                   sprites/ (hero, weapons, creatures, beings, hostiles, sprite sheets; sizes.ts);
                   scenes/ (per-location layers: sky, skyline, ground, frames, props, ambient; scale.ts)
  editor/          Scene editor (dist/editor.html): model.ts (hit tests, drags, undo) · panel.ts (side panel HTML) · main.ts
  ui/              ui.ts (input + UI-only state) · views/ (title, ship, mission: state → HTML) ·
                   widgets.ts (chips) · html.ts (helpers) · keys.ts (keyboard bindings)
tests/             node:test suites (run via tsx, all in one process) + golden files; helpers.ts
scripts/           build, dev server, lint, sim, golden updater; browser.mjs (shared Chromium set-up)
                   for e2e, gallery and scene; sprites.py / rig.py / pixel-font.py (art pipeline)
```

Key design rules:

1. **All game logic lives in `src/core` and is pure.** `step()` never mutates its input; every random roll comes from `state.rng`. The same seed and actions always give the same result, and a save/load continues identically.
2. **One source of truth for legality.** `checkAction()` and `legalActions()` are used by the reducer, the UI, the bot and the fuzz tests. Illegal actions return the unchanged state plus an `error` event, never an exception.
3. **Rendering only reacts.** The reducer emits events (`attack`, `statusApplied`, `levelUp`, …). The stage animates them and the UI re-renders from state. If the stage fails to start the game still works. The UI and the stage never import each other (`npm run lint` checks who may import whom: `LAYERS` in `scripts/lint.ts`; inside core, data, stats and combat can't reach missions, saves or the bot). While a step's events play, the UI shows `GameController.shown`, which catches up one event at a time (the stage reports each as it finishes), so HP bars and log lines change when a hit lands, not when the button is pressed.
4. **Views are functions.** Each view takes state (plus the UI-only bits it needs, like the open tab) and returns HTML; the `UI` class only handles input and decides what to render. Log text and its tone (good/bad/loot) come from core events, never from matching strings.

## Testing strategy

- **Unit tests** for formulas, statuses (e.g. "a 3-turn shield covers exactly 3 hostile turns"), shops, mission flow, saves, the stage's geometry and the editor. `tests/helpers.ts` sets up states (`newGame`, `inBattle(state, lineup)`, `teach`, `fightOut`, `endlessFight`, `sureHit`); content tables are frozen in tests.
- **Fuzz tests:** 40 seeds × 1500 random (partly garbage) actions, asserting invariants after every step: no softlocks, HP, energy and credits in bounds, mode consistency, a valid loadout, no status twice on anyone, rejected actions don't change state, and step() never mutates its input; plus save/load round trips on three seeds.
- **Playthrough tests:** the bot must finish the whole game (six seeds).
- **Golden tests** (`tests/golden/`): exact seeded transcripts and bot summaries. Any change to formulas, content or turn order shows up as a readable diff. If the change was intended, run `npm run test:update-golden` and review `git diff tests/golden`.
- **E2E** (`scripts/e2e.mjs`): real clicks through title → ship → battle, a 400-action bot run through the real UI and renderer, a HUD/state sync check, a non-blank canvas check, reload/continue, a mobile layout check, and zero console errors.

The browser build exposes `window.__qf` (`state`, `legal()`, `dispatch(action)`, `botStep()`, `speed(n)`, `load(state)`, `hostileScreenPoint(slot)`) for debugging and tests. `load` jumps straight to any (validated) state, e.g. a specific fight.

## Balancing

`npm run sim` ends with a **stat-weights** table: for bot characters at levels 5, 10 and 15, it adds +5 points to one stat at a time, replays the same missions 300 times and reports how much each point raises a combat score:

    score = (damage dealt per turn) × max HP ÷ (damage taken per turn)     ≈ "damage per turn × effective HP"

Aim for every stat in roughly the same band (currently about 1–4% per point). Speed is the deliberate exception late on (≈0.5–1% at level 15): its curve is steep on purpose so double turns stay rare. If one stat dominates or one is near zero, adjust its knob in `src/core/stats.ts` and re-run. The campaign and patrol tables above it show the overall difficulty (deaths per playthrough / per patrol).

## Art

Everything is drawn in code, no image files. The scene has a fixed resolution: always 180 px tall and 320–384 px wide (16:9 up to about 2.1:1), scaled up by a whole number of device pixels so all art pixels are the same size, and centred with bars beyond that. Fighters and set pieces stand at fixed spots around the centre (positions are fractions of the 320 px scene, see `sceneX`), so a wider screen only shows a little more at the sides and nothing moves onto the edge pieces. A 16:9 screen (1280×720, or 4K at 300%) shows exactly 320×180; `npm run scene -- veridia 1700x720` shows another size. Figures are painted from shaded parts (ellipses, tubes, polygons) lit from the upper left, with ordered dithering between shades, a dark outline, thin lines where parts overlap, a rim light from the location, and glowing pixels that feed a bloom pass. Colours for hostiles come from their `look` colours via `rampOf()`, which darkens and hue-shifts them into the palette (cold, purple shadows; warm highlights).

The UI matches: panels sit in a riveted brass frame and buttons are bevelled plates, both small pixel-art images (SVG data URIs in `public/styles.css`) drawn at 2×. Headings, names, buttons, bars and combat numbers use the game's own pixel font, `public/fonts/starward-pixel.woff`, built from the bitmaps in `scripts/pixel-font.py` (`python3 scripts/pixel-font.py`, needs fontTools). It is sharp only at multiples of 10px; longer text stays in the regular font for readability.

Figures can also come from concept art. Put a sheet of figures on a black background in `art/concepts/`, list it in `scripts/sprites.py` and run `python3 scripts/sprites.py` (needs numpy, Pillow and OpenCV). It cuts out each figure, shrinks it to game size without blending colours, reduces it to a small palette, lines the frames up on their feet and writes `public/sprites/<name>.png` (frames on top, a glow mask below) plus `src/render/sprites/sheet-data.ts`. A hostile uses a sheet when its `look` has `sprite: { sheet, idle: [frames], attack?: [frames], fps? }` (attack frames are spread over the swing, the strike landing 40% in). Until a sheet has loaded, the painted figure stands in.

Sheets made with [PixelLab](https://pixellab.ai) live in `art/pixellab/<name>/` and are listed under `PIXEL` in `scripts/sprites.py`: they are already pixel art, so they are only trimmed and lined up on their feet. The Brood Matriarch (`plague_matriarch`) was made this way: `base.png` is the concept art converted with *image to pixel art* (80×112), `idle-*.png` and `attack-*.png` are two *animate image* runs on it (frame 0 is the input). Keep new ones facing left (hostiles) or right (the officer), on a transparent background, at about the size they'll stand in the game.

The Veridia Fen hostiles (`fen_leech`, `rotwired_penitent`, `choir_cantor`, `archcantor`) were made the same way: *create image (pro)* with the officer as the style image (side view, flipped to face left where needed) → `base.png`, then two *animate image* runs on it (`idle-*` with the last frame pinned to the first so it loops, and `attack-*`). `sprites.py` matches every frame's colours to `base.png` (brightness, then its palette), so a frame the model lit up doesn't flash.

**Layers** (`layouts.json`, drawn by `src/render/scenes/backdrop.ts`): each location is a list of layers, drawn back to front, and that order is all there is to what covers what. A layer is a painted part of the location's look (`sky`, the `body` in the sky, `sky-fx` such as lightning, each `skyline` rank, `haze`, the ship's `nave`, `ground`, a painted `frame` or `prop`, `weather` and fog, the `vignette`), a generated `sprite`, or `fighters`, where the figures are drawn. Placed layers (sprites, props, the body) have `x, y`: their top-left corner in the 320 × 180 scene every screen shows. On a wider screen they keep their place around the centre like the fighters, or, with `pinned`, next to their nearest edge (the framing tree and house, or barrels tucked behind the tree). A sprite loops its frames at `fps`, can be mirrored (`flip`), and `fog` (0–1) tints it toward the location's haze so distant things recede. So the chapel-forge sits between two tree lines and behind the haze just by where it is in the list. Veridia's tree, house, chapel-forge, reliquary, leaking barrels (only the acid moves: `STILL` in `sprites.py`) and lantern are generated; its sky, tree lines, fog, spores, lightning and floor are painted. `npm run scene` screenshots each location without figures or UI (`test-results/scene-<mission>.png`).

**Scale** (`src/render/scenes/scale.ts`): one scale for all generated art, used to check it, not to place it. The officer is 1.8 m and 82 px on the fighters' line (45.6 px per metre). Art is made for a plane, which scales it: `foreground` 1.25×, `fighters` 1×, `behind` 0.8×, `background` 0.5×, `distant` 0.25×, `horizon` 0.08×. Each set piece's real height and plane are in `src/render/sprites/sizes.ts` (hostiles: `look.height`, on the fighters' line), and `tests/sprites.test.ts` checks every sprite is within 15% of `metres × 45.6 × plane` pixels, so a new monster or barrel can't come out twice the size it should be. When generating, aim for that size: a 0.9 m barrel for `behind` is 33 px; a person on the fighters' line is 82 px. The editor shows each sprite's plane, its size check, and the line where that plane's feet would be, as a guide.

**Scene editor** (`src/editor/`, `npm run dev` → http://localhost:5173/editor.html, or *Scene editor* under the combat drill in a dev build): a location with a practice lineup in it. The panel lists its layers, front at the top: ▲ / ▼ (or PgUp / PgDn) reorder them, the checkbox hides one while editing (not saved). Placed layers can be dragged in the scene or nudged with the arrow keys; the inspector has `x`, `y`, pinned (P), mirrored (F), fps and fog. Sprites can be added (just behind the fighters), duplicated and deleted. View toggles: glow, guides (horizon, fighters' line, the 320 px frame, the selected sprite's plane line) and the scene width (320, 352, 384). ⟨ hides the panel. Ctrl+Z undoes, Ctrl+S saves: the dev server rewrites `layouts.json` (one line per layer) and the page reloads with it. Unsaved edits survive reloads until saved or reverted. It runs its own game state, so the game's save is untouched; without the dev server, Save copies the layout to the clipboard.

**Rigged characters** (the officer): PixelLab draws the body, code draws the weapon. Workflow for a new character:

1. **References** in `art/concepts/` (e.g. `soldier-aim.png`, made with Gemini): side view, on a plain background.
2. **Base sprites**: PixelLab *create image (pro)* with the reference, side view facing right, empty fists, 80×112 → `art/pixellab/<name>/base.png`; then one sprite per stance, made the same way with `base.png` as the reference (`base-aim.png`: arms forward; `base-ready.png`: guard). Animating from a sprite already in the stance keeps the frames clean: the skeleton only nudges it, instead of redrawing the arms far from where they were.
3. **Rig**: the 18 joints of each base sprite in `art/pixellab/<name>/rig.json` (`joints`, and `bases.aim` / `bases.ready`), plus the animations it uses. `python3 scripts/rig.py preview <name>` draws the skeleton over the sprite (and every pose of its animations) to `test-results/rig-<name>.png` to check them.
4. **Animations**: the templates in `scripts/rig.py` are written as body offsets and arm angles, so they fit any humanoid. `aim` (from `base-aim`): 4-frame idle loop + 2-frame shot, with both hands kept on the gun (the body breathes, the elbows follow by IK, the gun only bobs and kicks). `swing` (from `base-ready`): 4-frame idle loop + 6-frame overhead strike with the front arm (cocked behind the head, over the top, down, strike, follow-through, low finish), with full-length arms. `python3 scripts/rig.py keypoints <name> <animation>` prints the joints for one PixelLab *animate with skeleton* request; an animation listed under `wide` in rig.json is drawn on a bigger canvas (the base padded right and down) so a swing isn't cut off. Save the frames as `art/pixellab/<name>/<animation>-<i>.png`.
5. **Sheet**: list it under `RIGGED` in `scripts/sprites.py` and run it. It writes the strip and `RIGS` in `sheet-data.ts`: each animation's frames and, per frame, where the weapon hand grips and at what angle (the angle from the skeleton, guns carried `drop` degrees lower than the forearms point; the grip from the drawn fist at the end of the arm), and `<name>_grip.png`: per frame, a mask of the holding forearm and fist. The head is cut once from the first pose base and pasted into every frame (matched to within a few pixels), so the face stays the same across animations.

**Weapon sprites**: PixelLab *create 1-direction object* (side view, pointing right, transparent) → `art/pixellab/weapons/<item id>.png`, listed under `WEAPONS` in `scripts/sprites.py` (rifles drawn at 48 px; very long ones at 96 px and halved; the carbine at 32 px). The script finds each one's grip (handle) and muzzle and writes `public/sprites/weapons.png` and `WEAPONS` in `sheet-data.ts`; the renderer rotates the sprite around the grip at the hand's angle. Items without a sprite fall back to the code-drawn `SHAPES`.

**Armor bodies**: an armor can have its own rigged sheet, made from the officer's: PixelLab *edit image* on `base.png`, `base-aim.png` and `base-ready.png` together (one call, so the three match) with the armor described and the pose kept → `art/pixellab/<name>/`; copy the officer's `rig.json` (the poses are the same, check with `rig.py preview`), animate as in step 4 and list it under `RIGGED`. `bodyOf` in `hero.ts` picks the sheet by armor; armors without one wear the officer's. `officer_power` is the power armor (Aegis).

In game (`src/render/sprites/hero.ts`) the idle loop plays while waiting and the attack frames play forward once; the weapon is drawn at the grip, then the holding forearm and fist again on top (the grip mask) so the hand closes around it. `npm run gallery -- weapons` shows every weapon in his hands, to check sizes. Hostiles don't need the weapon layer: they keep whatever they hold in the sprite.

Style rules: dark and desaturated overall, colour concentrated in glows (eyes, fire, runes, windows); brass and crimson for the human side; one light direction; outlines on figures and set pieces, flat two-tone silhouettes for distant skylines.

## Adding content

- **New hostile:** add it to `src/core/data/hostiles.ts` and list it in a mission. `look.sprite` uses a concept-art sheet (see Art); otherwise `look` picks a procedural body plan (`blob`, `beast`, `brute`, `humanoid`, `husk`, `elemental`, `flyer`, `golem`, `serpent`, `dragon`, `insect`, `wraith`, `wisp`), colours, a scale and optional `features` (e.g. `helmet`, `shield`, `blade`, `spikes`, `wings`, `crown`). Check it with `npm run gallery`.
- **New item or ability:** add it to `items.ts` / `abilities.ts`. Weapons have a visual `style` (`melee` or `ranged`); the held sprite is its PixelLab sprite (see Art, *Weapon sprites*), else `SHAPES` in `src/render/sprites/weapons.ts`. Quartermaster stock is everything with a price above 0.
- **New mission:** add it to `missions.ts` with `requires` pointing at the previous one (the last one sets `FINAL_MISSION` and a `finale`), then add its backdrop recipe (sky, skyline, ground, frames, props, weather) to `src/render/scenes/locations.ts`. For pack fights, list lineups (1–3 hostile ids) in `groups`, and escorts for the priority target in `bossAdds` (max 2; the boss stands between them).
- **Renaming content ids** breaks existing saves: bump `SAVE_VERSION` and add a migration to `MIGRATIONS` in `src/core/save.ts`.

`validateContent()` (run by the test suite) catches broken references. Then run `npm run sim` to check balance and `npm run test:update-golden` to accept the new behaviour.
