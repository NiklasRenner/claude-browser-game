/**
 * Pixel-art figures painted from shaded parts (see ../pixel/painter.ts).
 *
 *   figure.ts     the Figure type and small helpers
 *   hero.ts       the player's officer (division, armor tier, weapon)
 *   weapons.ts    held weapons
 *   creatures.ts  beast, brute, flyer, serpent, dragon, insect
 *   beings.ts     blob, humanoid, husk, elemental, golem, wraith, wisp
 *   hostiles.ts   look → body plan
 *
 * `npm run gallery` paints every figure side by side (test-results/gallery.png).
 */
export type { Figure, Pose } from './figure';
export { heroFigure } from './hero';
export { hostileFigure } from './hostiles';
export { paintFigure } from './paint';
