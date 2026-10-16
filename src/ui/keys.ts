import { loadoutAbilities } from '../core';
import type { Action, GameState } from '../core';

/**
 * Keyboard shortcuts. Returns the game action for a key in the current mode, or null.
 * Kept as a pure function of state so it can be unit-tested and reused (e.g. for a help overlay).
 */
export function keyAction(s: GameState, key: string, shift = false): Action | null {
  const k = key.toLowerCase();
  const advance = k === 'enter' || k === ' ' || k === 'c';
  switch (s.mode) {
    case 'battle': {
      if (k === 'tab') {
        // Cycle through living hostiles (Shift+Tab goes backwards).
        const b = s.battle!;
        const n = b.hostiles.length;
        for (let step = 1; step < n; step++) {
          const i = (b.target + (shift ? n - step : step)) % n;
          if (b.hostiles[i]!.hp > 0) return { type: 'target', index: i };
        }
        return null;
      }
      if (k === 'a') return { type: 'attack' };
      if (k === 'f') return { type: 'flee' };
      if (/^[1-9]$/.test(k)) {
        const ability = loadoutAbilities(s.player!)[Number(k) - 1];
        return ability ? { type: 'useAbility', abilityId: ability.id } : null;
      }
      return null;
    }
    case 'mission':
      if (advance) return { type: 'continue' };
      if (k === 'r') return { type: 'retreat' };
      return null;
    case 'defeated':
      return advance ? { type: 'returnToShip' } : null;
    default:
      return null;
  }
}
