import type { ClassDef, ClassId } from '../types';

/**
 * Divisions differ only in their ability kits and starting gear. Stats are
 * generic and every officer starts with the same ones (see stats.ts).
 * `statPriority` is just how the autoplayer likes to build each division.
 */
export const CLASSES: Record<ClassId, ClassDef> = {
  security: {
    id: 'security',
    name: 'Security Officer',
    description: 'Front-line protector. Overcharged shots, personal shields, combat stims and suppressive fire.',
    statPriority: ['pow', 'end', 'spd', 'pow', 'end'],
    startWeapon: 'sidearm_mk1',
    startArmor: 'duty_uniform',
    color: 0xc8382e,
  },
  science: {
    id: 'science',
    name: 'Science Officer',
    description: 'Field scientist. Precise plasma, cryo and ion abilities that exploit weaknesses, plus deflectors and orbital strikes.',
    statPriority: ['pow', 'int', 'end', 'pow', 'int', 'spd'],
    startWeapon: 'sonic_emitter',
    startArmor: 'duty_uniform',
    color: 0x2e7fd8,
  },
  engineer: {
    id: 'engineer',
    name: 'Engineer',
    description: 'Resourceful tinkerer. Corrosive nanites, holo-decoys, cryo grenades and precision overloads that hunt for weak points.',
    statPriority: ['pow', 'luk', 'int', 'end', 'pow', 'spd'],
    startWeapon: 'mag_wrench',
    startArmor: 'duty_uniform',
    color: 0xd89a2e,
  },
};
