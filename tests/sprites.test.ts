import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOSTILES } from '../src/core/data/hostiles';
import { MISSION_ORDER } from '../src/core/data/missions';
import { frameAt } from '../src/render/sprites/hostiles';
import { sizeFit } from '../src/render/scenes/scale';
import { LAYOUT_DATA, LOCATION_IDS, locationOf } from '../src/render/scenes/locations';
import { PIECE_SIZES } from '../src/render/sprites/sizes';
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

  // One scale (src/render/scenes/scale.ts): the officer is 1.8 m and 82 px on the fighters' line, and art
  // made for a plane farther back is drawn smaller by that plane's factor. Each generated asset declares
  // its real height and plane, and its sprite must match, so a new monster or barrel can't come out twice
  // the size it should be. (Where it's drawn is up to the layout; this only checks the art.)
  it('hostile sprites are sized for their real height on the fighters\' line', () => {
    for (const h of Object.values(HOSTILES)) {
      const sp = h.look.sprite;
      if (!sp) continue;
      assert.ok(h.look.height, `${h.id}: a sprite hostile needs look.height (metres)`);
      const { px, expected, ok } = sizeFit(SHEETS[sp.sheet as keyof typeof SHEETS].h, h.look.height, 'fighters');
      assert.ok(ok, `${h.id}: ${px} px tall, ${expected} px expected for ${h.look.height} m`);
    }
  });

  it('every generated set piece used in a scene has a size label, and its sprite fits it', () => {
    for (const id of LOCATION_IDS) {
      for (const l of locationOf(id).layers) {
        if (l.part !== 'sprite') continue;
        const size = PIECE_SIZES[l.sheet];
        assert.ok(size, `${l.sheet}: add its real height and plane to src/render/sprites/sizes.ts`);
        const { px, expected, ok } = sizeFit(SHEETS[l.sheet].h, size.metres, size.plane);
        assert.ok(ok, `${l.sheet}: ${px} px tall, ${expected} px expected for ${size.metres} m on the ${size.plane} plane`);
      }
    }
  });

  it('every world and the ship has its own location (an unknown one would quietly fall back to Veridia)', () => {
    for (const id of ['ship', ...MISSION_ORDER]) assert.ok(LOCATION_IDS.includes(id), `no location look for ${id}`);
  });

  it('every location has a valid saved layout (layouts.json, written by the scene editor)', () => {
    assert.deepEqual(Object.keys(LAYOUT_DATA).sort(), [...LOCATION_IDS].sort());
    for (const id of LOCATION_IDS) {
      const loc = locationOf(id);
      assert.equal(loc.layers.filter((l) => l.part === 'fighters').length, 1, `${id}: exactly one fighters layer`);
      for (const l of loc.layers) {
        if ('x' in l) assert.ok(Number.isInteger(l.x) && Number.isInteger(l.y), `${id} ${l.part}: whole-pixel x, y`);
        if (l.part === 'sprite') assert.ok(l.sheet in SHEETS, `${id}: unknown sheet ${l.sheet}`);
        if (l.part === 'skyline') assert.ok(loc.skyline[l.rank], `${id}: no skyline rank ${l.rank}`);
        if (l.part === 'body') assert.ok(loc.body, `${id}: a body layer but no body in the look`);
        assert.ok(['sky', 'sky-fx', 'nave', 'haze', 'ground', 'weather', 'vignette', 'fighters', 'skyline', 'frame', 'body', 'prop', 'sprite'].includes(l.part), `${id}: unknown part ${l.part}`);
      }
    }
  });
});
