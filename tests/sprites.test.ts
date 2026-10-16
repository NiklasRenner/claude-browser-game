import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOSTILES } from '../src/core/data/hostiles';
import { frameAt } from '../src/render/sprites/hostiles';
import { SHEETS } from '../src/render/sprites/sheet-data';

describe('sprite sheets', () => {
  const anim = { sheet: 'x', idle: [0, 1, 2, 3], attack: [4, 5, 6, 7, 8], fps: 8 };

  it('loops the idle frames at fps', () => {
    assert.deepEqual([0, 0.124, 0.125, 0.375, 0.5, 0.625].map((t) => frameAt(anim, t, 0)), [0, 0, 1, 3, 0, 1]);
    assert.equal(frameAt({ sheet: 'x', idle: [5, 6] }, 0.72, 0), 6); // default 1.4 fps
  });

  it('spreads the attack frames over the swing, the strike frame at 0.4', () => {
    assert.deepEqual([0.01, 0.2, 0.4, 0.6, 0.99, 1].map((a) => frameAt(anim, 3, a)), [4, 5, 6, 7, 8, 8]);
    assert.equal(frameAt({ sheet: 'x', idle: [2] }, 0, 0.5), 2); // no attack frames: stays idle
  });

  it('every hostile sprite names a sheet and frames it has', () => {
    for (const h of Object.values(HOSTILES)) {
      const sp = h.look.sprite;
      if (!sp) continue;
      const sheet = SHEETS[sp.sheet as keyof typeof SHEETS];
      assert.ok(sheet, `${h.id}: no sheet ${sp.sheet}`);
      for (const f of [...sp.idle, ...(sp.attack ?? [])]) assert.ok(f >= 0 && f < sheet.frames, `${h.id}: frame ${f}`);
    }
  });
});
