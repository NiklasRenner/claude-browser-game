// Public surface of the pure game core. Nothing in src/core touches the DOM.
export * from './types';
export * from './data';
export * from './game';
export * from './rules';
export { missionEncounters as missionEncounters } from './flow';
export * from './player';
export * from './combat';
export * from './save';
export * from './bot';
export { Rng } from './rng';
export * from './patrol';
export { drillHostile, drillRoster } from './drill';
export { describeLog, describeStep, hostileLabels } from './describe';
export type { LogEntry, Tone } from './describe';
export * from './stats';
