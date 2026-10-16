import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOSTILES } from '../src/core/data/hostiles';
import { frameAt } from '../src/render/sprites/hostiles';
import { MISSION_ORDER } from '../src/core/data';
import { PX_PER_M, depthOf } from '../src/render/scenes/depth';
import { LAYOUT_DATA, LOCATION_IDS, locationOf } from '../src/render/scenes/locations';
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

  // One scale for everything on the fighters' line (see src/render/scenes/depth.ts): the officer is 1.8 m
  // and 82 px. A hostile drawn from a sprite declares its real height, and its sprite must match it, so a
  // new monster can't come out twice the size it should be.
  it('hostile sprites are sized for their real height', () => {
    for (const h of Object.values(HOSTILES)) {
      const sp = h.look.sprite;
      if (!sp) continue;
      assert.ok(h.look.height, `${h.id}: a sprite hostile needs look.height (metres)`);
      const px = SHEETS[sp.sheet as keyof typeof SHEETS].h - 2, want = h.look.height * PX_PER_M;
      assert.ok(Math.abs(px / want - 1) <= 0.15, `${h.id}: ${px} px tall, ${Math.round(want)} px expected for ${h.look.height} m`);
    }
  });

  it('every location has a valid saved layout (layouts.json, written by the scene editor)', () => {
    assert.deepEqual(Object.keys(LAYOUT_DATA).sort(), [...LOCATION_IDS].sort());
    for (const [id, l] of Object.entries(LAYOUT_DATA)) {
      assert.ok(Array.isArray(l.props) && Array.isArray(l.pieces), `${id}: props and pieces`);
      if (l.behind !== undefined) assert.ok(Number.isInteger(l.behind) && l.behind >= 0 && l.behind <= l.pieces.length, `${id}: behind ${l.behind}`);
      for (const p of l.pieces) {
        assert.ok(p.sheet in SHEETS, `${id}: unknown sheet ${p.sheet}`);
        assert.ok(['ground', 'far', 'hang', 'left', 'right'].includes(p.at), `${id} ${p.sheet}: at ${p.at}`);
        assert.ok(Number.isFinite(p.x), `${id} ${p.sheet}: x`);
        if (p.at === 'hang') assert.ok(p.from?.length === 2, `${id} ${p.sheet}: a hanging piece needs from`);
      }
    }
  });

  it('set pieces on the ground or the skyline stand at a sensible depth for their size', () => {
    for (const id of MISSION_ORDER) {
      for (const p of locationOf(id).pieces) {
        if (p.at !== 'ground' && p.at !== 'far') continue;
        assert.ok(p.height, `${id} ${p.sheet}: needs a height (metres)`);
        const d = depthOf(SHEETS[p.sheet].h - 2, p.height);
        if (p.at === 'ground') assert.ok(d > 0.45 && d < 1.8, `${id} ${p.sheet}: depth ${d.toFixed(2)} (generate it at about ${Math.round(p.height * PX_PER_M)} px for the fighters' line)`);
        else assert.ok(d < 0.25, `${id} ${p.sheet}: depth ${d.toFixed(2)} is too near for the skyline`);
      }
    }
  });
});
