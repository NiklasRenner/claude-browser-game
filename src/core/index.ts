// Public surface of the pure game core. Nothing in src/core touches the DOM.
export * from './types';
export * from './data';
export * from './game';
export * from './player';
export * from './combat';
export * from './save';
export * from './bot';
export { Rng, hashSeed } from './rng';
export { describeEvent, describeStep } from './describe';
export type { DescribeContext } from './describe';
