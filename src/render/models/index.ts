/**
 * Procedural low-poly figures built from primitives — no asset files needed.
 *
 *   builder.ts    materials, primitives, joints, the Figure type
 *   hero.ts       the player's officer (division, armor tier, weapon)
 *   weapons.ts    held weapons
 *   creatures.ts  beasts, brutes, bats, serpents, dragons, insects
 *   beings.ts     oozes, humanoids, husks, elementals, golems, wraiths, wisps
 *   hostiles.ts   look → body builder
 *
 * `npm run gallery` renders every figure side by side (test-results/gallery.png).
 */
export { disposeObject } from './builder';
export type { Figure } from './builder';
export { buildHero } from './hero';
export { buildHostile } from './hostiles';
