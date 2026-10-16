"""
Turns concept sheets (art/concepts/*.png: figures on a black background) into
game sprites: public/sprites/<name>.png plus src/render/sprites/sheet-data.ts.

    python3 scripts/sprites.py        (needs numpy, Pillow, opencv-python)

For each sheet:
  1. find the figures (anything brighter than the black background, below the
     title text), one frame per figure, left to right;
  2. cut each one out (flood fill the background from outside, so dark outline
     pixels inside the figure stay);
  3. shrink by SCALE, picking for every block the source pixel closest to the
     block's average (so no new, blended colours), then reduce to a small
     palette so it reads as pixel art at game size;
  4. line the frames up on their feet and write one strip, with a second row
     holding the glow mask (pixels that light up and feed the bloom).

Sheets share SCALE so pixels match in size; a boss can use a smaller one to come out bigger.
Sprites face the way the game wants: the officer right, hostiles left.

Sheets made with PixelLab (art/pixellab/<name>/*.png, see PIXEL below) are
already pixel art at game size on a transparent background: their frames are
only trimmed and lined up on their feet (step 4), never resized. LOCKED ones are
colour-matched to their base sprite, except for what glows (see lit_by_effect).
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
SRC = ROOT / 'art' / 'concepts'
OUT = ROOT / 'public' / 'sprites'
TS = ROOT / 'src' / 'render' / 'sprites' / 'sheet-data.ts'
SCALE = 4          # source pixels per game pixel (sheets can override, e.g. a boss drawn bigger)
COLORS = 64        # palette size per sheet
BG = 22            # brighter than this = part of a figure (for finding frames)
VOID = 7           # this dark = background (cut-out), when connected to the outside or in a sizeable patch

# name, source sheet(s) (frames are taken in order), flip (face left),
# glow hue ranges in degrees (min saturation/value apply), scale
SHEETS = [
    ('brood_minions', 'brood-minions.png', True, [(255, 300)], SCALE),
]


GREEN, CANDLE = [(75, 160)], [(35, 60)]  # glow hues: the Choir's sickly green, candle flames
# Sheets whose frames are colour-matched to their base.png (see main).
LOCKED = {'fen_leech', 'rotwired_penitent', 'choir_cantor', 'archcantor'}
# Sheets where only the glowing parts animate (the rest is held at the first frame).
STILL = {'fen_barrels'}
# PixelLab sheets: name, frame files in art/pixellab/<name>/ (in order), glow hue ranges.
# The matriarch: an 8-frame idle loop, then a 5-frame claw swipe (wind-up, strike, recover).
PIXEL = [
    ('plague_matriarch', [f'idle-{i}.png' for i in range(1, 9)] + [f'attack-{i}.png' for i in range(4, 9)], []),
    # Veridia Fen: made with create image (pro), then two animate image runs on base.png (idle-0 and attack-0
    # are the input frame). Frames: idle 0-4, then the attack.
    ('fen_leech', [f'idle-{i}.png' for i in range(5)] + [f'attack-{i}.png' for i in range(1, 7)], GREEN),
    ('rotwired_penitent', [f'idle-{i}.png' for i in range(5)] + [f'attack-{i}.png' for i in range(1, 7)], GREEN),
    ('choir_cantor', [f'idle-{i}.png' for i in range(5)] + [f'attack-{i}.png' for i in range(1, 7)], GREEN),
    ('archcantor', [f'idle-{i}.png' for i in range(5)] + [f'attack-{i}.png' for i in range(1, 7)], GREEN + CANDLE),
    # Veridia set pieces (sprite layers in src/render/scenes/layouts.json; sizes in src/render/sprites/sizes.ts): a looping animation each (loop-0 is the input).
    ('fen_chapel', ['base.png'], GREEN),
    ('fen_shrine', [f'loop-{i}.png' for i in range(6)], GREEN + CANDLE),
    ('fen_barrels', [f'loop-{i}.png' for i in range(6)], GREEN),
    ('fen_lantern', [f'loop-{i}.png' for i in range(4)], GREEN),
    # Edge structures (replace the painted frames): the swamp tree on the left, the colony house on the right.
    ('fen_tree', ['base.png'], []),
    ('fen_house', ['base.png'], [(15, 45)]),
]
# Rigged PixelLab sheets (see scripts/rig.py): frames posed from one base sprite, so the
# feet never move. All frames share one crop, and the weapon hand is known in each.
RIGGED = [('officer', []), ('officer_power', [(25, 50)])]  # the power armor's visor glows


def frames_of(img: np.ndarray) -> list[tuple[int, int, int, int]]:
    mask = (img.max(axis=2) > BG).astype(np.uint8)
    mask[:50] = 0  # title text
    blobs = cv2.dilate(mask, np.ones((9, 9), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(blobs)
    boxes = [tuple(int(v) for v in stats[i, :4]) for i in range(1, n) if stats[i, 4] > 3000]
    return sorted(boxes)


def cut(img: np.ndarray, box) -> np.ndarray:
    x, y, w, h = box
    pad = 6
    x0, y0 = max(0, x - pad), max(50, y - pad)
    crop = img[y0:y + h + pad, x0:x + w + pad]
    dark = (crop.max(axis=2) <= VOID).astype(np.uint8)
    # Background = near-black patches that touch the border or are big enough to be a gap
    # (between legs, under an arm); small ones are part of the art (pupils, mouths).
    n, lab, stats, _ = cv2.connectedComponentsWithStats(dark)
    hgt, wid = dark.shape
    alpha = np.full(dark.shape, 255, np.uint8)
    for i in range(1, n):
        bx, by, bw, bh, area = stats[i]
        touches = bx == 0 or by == 0 or bx + bw == wid or by + bh == hgt
        if touches or area > 400:
            alpha[lab == i] = 0
    # Drop specks that aren't attached to the figure.
    n, lab, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8))
    if n > 1:
        big = stats[1:, 4].max()
        keep = np.zeros(n, bool)
        keep[1:] = stats[1:, 4] > big * 0.01
        alpha = np.where(keep[lab], alpha, 0).astype(np.uint8)
    return np.dstack([crop, alpha])


def shrink(rgba: np.ndarray, scale: int) -> np.ndarray:
    h, w = rgba.shape[0] // scale, rgba.shape[1] // scale
    out = np.zeros((h, w, 4), np.uint8)
    for j in range(h):
        for i in range(w):
            block = rgba[j * scale:(j + 1) * scale, i * scale:(i + 1) * scale].reshape(-1, 4)
            solid = block[block[:, 3] > 0]
            if len(solid) * 2 < len(block):
                continue
            rgb = solid[:, :3].astype(int)
            mean = rgb.mean(axis=0)
            out[j, i, :3] = rgb[np.argmin(((rgb - mean) ** 2).sum(axis=1))]
            out[j, i, 3] = 255
    return out


def trim(rgba: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(rgba[:, :, 3])
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()


def glow_mask(rgba: np.ndarray, hues) -> np.ndarray:
    hsv = cv2.cvtColor(np.ascontiguousarray(rgba[:, :, :3]), cv2.COLOR_RGB2HSV).astype(int)
    hue, sat, val = hsv[:, :, 0] * 2, hsv[:, :, 1], hsv[:, :, 2]
    on = np.zeros(hue.shape, bool)
    for lo, hi in hues:
        on |= (hue >= lo) & (hue <= hi) & (sat > 90) & (val > 120)
    return on & (rgba[:, :, 3] > 0)


def lit_by_effect(rgba: np.ndarray, hues, palette: np.ndarray) -> np.ndarray:
    """
    The pixels of a frame that are an effect lighting up (a staff flaring, a spell), not the figure:
    in the sheet's glow hues and bright (or unlike any colour of the base sprite), plus the near-white
    cores joined to them. These keep their colour when the frame is colour-matched, and glow.
    """
    hsv = cv2.cvtColor(np.ascontiguousarray(rgba[:, :, :3]), cv2.COLOR_RGB2HSV).astype(int)
    hue, sat, val = hsv[:, :, 0] * 2, hsv[:, :, 1], hsv[:, :, 2]
    rgb = rgba[:, :, :3].astype(int)
    far = ((rgb[:, :, None, :] - palette[None, None, :, :]) ** 2).sum(axis=3).min(axis=2) > 40 ** 2
    tinted = np.zeros(hue.shape, bool)
    for lo, hi in hues:
        tinted |= (hue >= lo) & (hue <= hi)
    # Glow-coloured and either bright or unlike the base (the figure's own greens are dim).
    lit = tinted & (sat > 50) & (val > 130) & (far | (val > 200))
    # White-hot cores: near-white pixels joined to a lit one.
    pale = (val > 200) & (sat <= 50)
    core = lit.copy()
    for _ in range(12):
        grown = cv2.dilate(core.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & (pale | lit)
        if (grown == core).all():
            break
        core = grown
    return core & (rgba[:, :, 3] > 0)


def feet(s: np.ndarray) -> int:
    """x of the feet: the middle of the lowest fifth of the figure."""
    ys, xs = np.nonzero(s[:, :, 3])
    return int(round(xs[ys > ys.max() - s.shape[0] // 5].mean()))


def write_strip(name: str, sprites: list[np.ndarray], hues, lit: list | None = None) -> tuple:
    """Lines the frames up on their feet and writes the strip (row 2: glow mask; `lit`: more glowing pixels per frame)."""
    left = max(feet(s) for s in sprites) + 2
    right = max(s.shape[1] - feet(s) for s in sprites) + 2
    fw, ax = left + right, left
    fh = max(s.shape[0] for s in sprites) + 2
    sheet = np.zeros((fh * 2, fw * len(sprites), 4), np.uint8)
    for k, s in enumerate(sprites):
        bottom = np.nonzero(s[:, :, 3])[0].max()
        ox, oy = k * fw + ax - feet(s), fh - 1 - bottom
        sheet[oy:oy + s.shape[0], ox:ox + s.shape[1]][s[:, :, 3] > 0] = s[s[:, :, 3] > 0]
        g = glow_mask(s, hues) | (lit[k] if lit else False)
        region = sheet[fh + oy:fh + oy + s.shape[0], ox:ox + s.shape[1]]
        region[g] = [255, 255, 255, 255]
    Image.fromarray(sheet).save(OUT / f'{name}.png')
    print(f'{name}: {len(sprites)} frames of {fw}×{fh}')
    return (name, len(sprites), fw, fh, ax)


def dehalo(rgba: np.ndarray) -> np.ndarray:
    """Removes the faint light fringe that skeleton animation leaves around moved limbs (pixels outside
    the black outline), and loose light specks. A fringe pixel: light, touching transparency and the outline."""
    a = rgba.copy()
    for _ in range(2):
        solid = a[:, :, 3] > 0
        lum = a[:, :, :3].astype(int).mean(axis=2)
        pad = lambda m, v: np.pad(m, 1, constant_values=v)
        S, L = pad(solid, False), pad(lum, 0)
        shifts = [(0, 1), (1, 0), (0, -1), (-1, 0)]
        nb = lambda M, dy, dx: M[1 + dy:M.shape[0] - 1 + dy, 1 + dx:M.shape[1] - 1 + dx]
        out = sum((~nb(S, dy, dx)).astype(int) for dy, dx in shifts)
        dark = sum((nb(S, dy, dx) & (nb(L, dy, dx) < 40)).astype(int) for dy, dx in shifts)
        kill = solid & (lum >= 70) & (((out >= 1) & (dark >= 1)) | (out >= 3))
        a[kill] = 0
    return a


def lock_head(rig, rigs_py, name, order, frames, shift):
    """Every frame gets the same head: the one from the first animation's base sprite.

    Each PixelLab frame redraws the face, so hair, glasses and features drift between frames and
    between animations. The head barely turns in side view, so it can be cut once and pasted back:
    find where each frame's head is (near where the skeleton puts it, then the best colour match),
    clear that frame's head and draw the canonical one there. Arms raised over the head are kept."""
    file, j = rigs_py.base_of(rig, order[0][0])
    base = np.array(Image.open(ROOT / 'art' / 'pixellab' / name / file).convert('RGBA'))
    bx0, bx1 = int(j['NECK'][0]) - 9, int(j['NOSE'][0]) + 4
    by1 = int(j['NECK'][1])
    rows = np.nonzero(base[:by1, bx0:bx1, 3] > 127)[0]
    by0 = rows.min()
    head = base[by0:by1, bx0:bx1].copy()
    mask = head[:, :, 3] > 127
    hh, hw = mask.shape
    sx, sy = shift[order[0][0]]
    for k, (anim, i) in enumerate(order):
        f = frames[k]
        _, bj = rigs_py.base_of(rig, anim)
        pj = rigs_py.anim_joints(rig, anim)[i]
        dx, dy = shift[anim]
        # Where the skeleton puts this frame's nose, relative to the canonical head's nose.
        px = pj['NOSE'][0] + dx - (j['NOSE'][0] + sx)
        py = pj['NOSE'][1] + dy - (j['NOSE'][1] + sy)
        best = None
        for oy in range(round(py) - 3, round(py) + 4):
            for ox in range(round(px) - 3, round(px) + 4):
                y, x = by0 + sy + oy, bx0 + sx + ox
                region = f[y:y + hh, x:x + hw]
                if region.shape[:2] != mask.shape:
                    continue
                solid = region[:, :, 3] > 0
                diff = np.abs(region[:, :, :3].astype(int) - head[:, :, :3]).sum(axis=2)
                score = np.where(mask & solid, diff, 0).sum() + (mask & ~solid).sum() * 300 + (~mask & solid)[:-3].sum() * 100
                if best is None or score < best[0]:
                    best = (score, x, y)
        _, x, y = best
        # Keep arm pixels that cross the head (a fist raised overhead).
        keep = np.zeros(f.shape[:2], bool)
        for side in ('RIGHT', 'LEFT'):
            pts = [pj[f'{side} {part}'] for part in ('SHOULDER', 'ELBOW', 'ARM')]
            for (ax_, ay_), (bx_, by_) in zip(pts, pts[1:]):
                if min(ay_, by_) + dy >= by1 + sy - 2:
                    continue
                for t in np.linspace(0, 1, 24):
                    cx, cy = int(round(ax_ + (bx_ - ax_) * t + dx)), int(round(ay_ + (by_ - ay_) * t + dy))
                    keep[max(0, cy - 3):cy + 4, max(0, cx - 3):cx + 4] = True
        clear = np.zeros(f.shape[:2], bool)
        clear[y - 1:y + hh - 3, x - 1:x + hw + 1] = True
        f[clear & ~keep] = 0
        region = f[y:y + hh, x:x + hw]
        paste = mask & ~keep[y:y + hh, x:x + hw]
        region[paste] = head[paste]


def write_rigged(name: str, hues, rigs: dict) -> tuple:
    """A rigged sheet: frames art/pixellab/<name>/<animation>-<i>.png, one shared crop."""
    import rig as rigs_py
    rig = rigs_py.load(name)
    order = rigs_py.frames(rig)
    frames = [np.array(Image.open(ROOT / 'art' / 'pixellab' / name / f'{a}-{i}.png').convert('RGBA')) for a, i in order]
    # Animations that reach far (a swing) are drawn on a wider canvas, extended right and down: pad to one size.
    H, W = max(f.shape[0] for f in frames), max(f.shape[1] for f in frames)
    frames = [np.pad(f, ((0, H - f.shape[0]), (0, W - f.shape[1]), (0, 0))) for f in frames]
    # Each animation starts from its own pose base; line them all up on the feet of the first one
    # (between the ankles, soles on the same row).
    def feet(anim):
        file, j = rigs_py.base_of(rig, anim)
        alpha = np.array(Image.open(ROOT / 'art' / 'pixellab' / name / file).convert('RGBA'))[:, :, 3]
        return (j['RIGHT LEG'][0] + j['LEFT LEG'][0]) / 2, np.nonzero(alpha)[0].max()
    fx0, fy0 = feet(order[0][0])
    shift = {}
    for a in rig['animations']:
        fx, fy = feet(a)
        shift[a] = (round(fx0 - fx), int(fy0 - fy))
    frames = [np.roll(f, shift[a], axis=(1, 0)) for f, (a, _) in zip(frames, order)]
    for f in frames:
        f[:, :, 3] = np.where(f[:, :, 3] > 127, 255, 0)
        f[:] = dehalo(f)
        # Drop stray specks (generation noise) not attached to the figure.
        n, lab, stats, _ = cv2.connectedComponentsWithStats((f[:, :, 3] > 0).astype(np.uint8))
        if n > 2:
            keep = np.zeros(n, bool)
            keep[1:] = stats[1:, 4] >= stats[1:, 4].max() * 0.02
            f[~keep[lab]] = 0
    lock_head(rig, rigs_py, name, order, frames, shift)
    solid = np.any(np.stack([f[:, :, 3] > 0 for f in frames]), axis=0)
    ys, xs = np.nonzero(solid)
    x0, y0, x1, y1 = max(0, xs.min() - 1), max(0, ys.min() - 1), xs.max() + 2, ys.max() + 1
    frames = [np.pad(f, ((0, 1), (0, 2), (0, 0))) for f in frames]
    fw, fh = x1 - x0, y1 - y0
    # Feet: between the two ankles of the base pose; the bottom row is the ground.
    ax = round(fx0) - x0
    sheet = np.zeros((fh * 2, fw * len(frames), 4), np.uint8)
    for k, f in enumerate(frames):
        crop = f[y0:y1, x0:x1]
        sheet[:fh, k * fw:(k + 1) * fw] = crop
        sheet[fh:, k * fw:(k + 1) * fw][glow_mask(crop, hues)] = [255, 255, 255, 255]
    Image.fromarray(sheet).save(OUT / f'{name}.png')
    anims, start = {}, 0
    for a in rig['animations']:
        n = len(rigs_py.TEMPLATES[a]['poses'])
        anims[a] = (start, rigs_py.TEMPLATES[a]['loop'], n)
        start += n
    def grip(k, fr, side):
        # The skeleton says roughly where the fist is; take it from the drawing instead.
        (sx, sy), (ex, ey), (wx, wy) = rigs_py.arm(rig, *fr, side)
        _, _, angle = rigs_py.hand(rig, *fr, side)
        dx, dy = shift[fr[0]]
        sx, sy, ex, ey, wx, wy = sx + dx, sy + dy, ex + dx, ey + dy, wx + dx, wy + dy
        # The drawn arm can be longer than the skeleton's (an arm foreshortened in the base); follow it out from
        # the shoulder: solid pixels in a corridor along shoulder→wrist, the furthest out is the fist's tip.
        n = np.hypot(wx - sx, wy - sy) or 1
        ux, uy = (wx - sx) / n, (wy - sy) / n
        ys, xs = np.nonzero(frames[k][:, :, 3])
        along_, across = (xs - sx) * ux + (ys - sy) * uy, -(xs - sx) * uy + (ys - sy) * ux
        wa = (wx - sx) * ux + (wy - sy) * uy
        near = (np.abs(across) <= 6) & (along_ >= wa * 0.6) & (along_ <= wa * 1.45)
        if near.any():
            tip = along_[near].max()
            fist = near & (along_ >= tip - 5)
            # The fist's middle: back from the tip, on the middle of what's drawn there.
            c = across[fist].mean()
            t = tip - 2.5
            wx, wy = sx + ux * t - uy * c, sy + uy * t + ux * c
        return (round(wx - x0 - ax, 1), round(wy - y0 - fh, 1), round(angle, 2)), forearm(k, (ex, ey), (wx, wy))
    def forearm(k, elbow, fist):
        # The holding forearm and fist as drawn: redrawn over the weapon so the hand wraps around it.
        ys, xs = np.mgrid[:frames[k].shape[0], :frames[k].shape[1]]
        (ex, ey), (fx, fy) = elbow, fist
        ex, ey = ex + (fx - ex) * 0.3, ey + (fy - ey) * 0.3  # not the elbow end: that's against the body
        dx, dy = fx - ex, fy - ey
        t = np.clip(((xs - ex) * dx + (ys - ey) * dy) / (dx * dx + dy * dy or 1), 0, 1)
        d = np.hypot(xs - ex - t * dx, ys - ey - t * dy)
        m = (frames[k][:, :, 3] > 0) & ((d <= 4) | (np.hypot(xs - fx, ys - fy) <= 4.5))
        return m[y0:y1, x0:x1]
    hand = lambda side: [grip(k, fr, side) for k, fr in enumerate(order)]
    right, left = hand('RIGHT'), hand('LEFT')
    weapon_hand = [l if rigs_py.TEMPLATES[a].get('hand') == 'LEFT' else r for r, l, (a, _) in zip(right, left, order)]
    rigs[name] = (anims, [g for g, _ in weapon_hand], [g for g, _ in left])
    # Grip masks: frame k = the weapon hand's forearm in frame k; frame N + k = the front hand's.
    masks = np.zeros((fh * 2, fw * len(frames) * 2, 4), np.uint8)
    for k, m in enumerate([m for _, m in weapon_hand] + [m for _, m in left]):
        masks[:fh, k * fw:(k + 1) * fw][m] = 255
    Image.fromarray(masks).save(OUT / f'{name}_grip.png')
    print(f'{name}: {len(frames)} rigged frames of {fw}×{fh}')
    return [(name, len(frames), fw, fh, ax), (f'{name}_grip', len(frames) * 2, fw, fh, ax)]


# Weapons (art/pixellab/weapons/<id>.png, PixelLab "1-direction object", side view pointing right).
# Optional: source scale (the long ones were drawn at double size), the kind (decides where the grip is
# found) or the grip itself where finding it goes wrong.
# Guns give their grip by hand: the middle of the pistol grip, a little below the body, where the
# fingers wrap round it (finding it automatically picks stocks, triggers and drum magazines instead).
WEAPONS = {
    'sidearm_mk1': {'grip': (3, 10)}, 'sonic_emitter': {'grip': (4, 12)}, 'gauss_pistol': {'grip': (3, 11)},
    'flechette_pistol': {'grip': (3, 11)}, 'plasma_pistol': {'grip': (3, 10)}, 'corrosive_needler': {'grip': (2, 10)},
    'cryo_carbine': {'grip': (6, 10)}, 'mass_driver': {'grip': (10, 11)}, 'photon_rifle': {'grip': (11, 10)},
    'plasma_cannon': {'grip': (6, 15)}, 'stasis_projector': {'grip': (11, 13)}, 'pulse_repeater': {'grip': (12, 12)},
    'nova_rifle': {'scale': 2, 'grip': (12, 6)},
    'ion_lance': {'scale': 2, 'kind': 'pole'}, 'singularity_edge': {'scale': 2, 'kind': 'sword'}, 'mag_wrench': {'kind': 'tool'},
}


def weapon_anchors(a: np.ndarray, kind: str) -> tuple:
    """Grip (where the hand holds it) and muzzle (where shots leave) of a weapon pointing right."""
    solid = a[:, :, 3] > 0
    h, w = solid.shape
    counts = solid.sum(axis=1)
    if kind == 'gun':
        # The barrel: the fullest row in the top half; the muzzle: its right end.
        barrel = int(np.argmax(counts[: max(2, h * 3 // 5)]))
        rows = solid[max(0, barrel - 1):barrel + 2]
        muzzle = (int(np.nonzero(rows.any(axis=0))[0].max()), barrel)
        # The handle: what hangs below the body, in the left part; held just under the body.
        below = solid.copy()
        below[: barrel + max(2, (h - barrel) // 3)] = False
        below[:, int(w * 0.65):] = False
        ys, xs = np.nonzero(below)
        gx = int(np.median(xs)) if len(xs) else w // 3
        return (gx, min(h - 1, barrel + max(2, (h - barrel) // 3))), muzzle
    mid = int(np.median(np.nonzero(solid)[0]))
    if kind == 'sword':
        # The guard is the tallest column in the left third; the hand sits just behind it.
        cols = solid.sum(axis=0)
        guard = int(np.argmax(cols[: w // 3]))
        return (max(0, guard - 4), mid), (w - 1, mid)
    # Pole arms and tools: held about a quarter along.
    return (int(w * (0.3 if kind == 'pole' else 0.2)), mid), (w - 1, mid)


def write_weapons(meta: list) -> list:
    """One strip of equal cells (top-left aligned), glow mask below; returns the anchors."""
    items = []
    for wid, opt in WEAPONS.items():
        a = np.array(Image.open(ROOT / 'art' / 'pixellab' / 'weapons' / f'{wid}.png').convert('RGBA'))
        a[:, :, 3] = np.where(a[:, :, 3] > 127, 255, 0)
        if opt.get('scale', 1) > 1:
            a = shrink(a, opt['scale'])
        a = trim(a)
        grip, muzzle = weapon_anchors(a, opt.get('kind', 'gun'))
        items.append((wid, a, (opt.get('grip', grip), muzzle)))
    cw, ch = max(a.shape[1] for _, a, _ in items), max(a.shape[0] for _, a, _ in items)
    sheet = np.zeros((ch * 2, cw * len(items), 4), np.uint8)
    for k, (_, a, _) in enumerate(items):
        sheet[:a.shape[0], k * cw:k * cw + a.shape[1]] = a
        hsv = cv2.cvtColor(np.ascontiguousarray(a[:, :, :3]), cv2.COLOR_RGB2HSV).astype(int)
        glow = (hsv[:, :, 1] > 110) & (hsv[:, :, 2] > 190) & (a[:, :, 3] > 0)
        sheet[ch:ch + a.shape[0], k * cw:k * cw + a.shape[1]][glow] = [255, 255, 255, 255]
    Image.fromarray(sheet).save(OUT / 'weapons.png')
    meta.append(('weapons', len(items), cw, ch, 0))
    print(f'weapons: {len(items)} of {cw}×{ch}')
    return [(wid, k, grip, muzzle) for k, (wid, _, (grip, muzzle)) in enumerate(items)]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = []
    for name, src, flip, hues, scale in SHEETS:
        sprites = []
        for file in [src] if isinstance(src, str) else src:
            img = np.array(Image.open(SRC / file).convert('RGB'))
            sprites += [trim(shrink(cut(img, box), scale)) for box in frames_of(img)]
        # One palette for the whole sheet.
        tall = max(s.shape[0] for s in sprites)
        strip = np.concatenate([np.pad(s, ((0, tall - s.shape[0]), (0, 1), (0, 0))) for s in sprites], axis=1)
        pal = Image.fromarray(strip[:, :, :3]).quantize(COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        lut = Image.fromarray(strip[:, :, :3]).quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
        q = np.array(lut)
        x = 0
        for k, s in enumerate(sprites):
            w = s.shape[1]
            s[:, :, :3] = q[:, x:x + w][:s.shape[0]]
            x += w + 1
            if flip:
                sprites[k] = s[:, ::-1]
        meta.append(write_strip(name, sprites, hues))
    for name, files, hues in PIXEL:
        sprites = []
        base = ROOT / 'art' / 'pixellab' / name / 'base.png'
        palette = None
        if name in LOCKED and base.exists():
            # Animation frames drift in colour (a lit frame turns the robe gold): snap every pixel to the
            # nearest colour of the base sprite (after matching its brightness), so only the shapes move.
            b = np.array(Image.open(base).convert('RGBA'))
            palette = np.unique(b[b[:, :, 3] > 127][:, :3], axis=0).astype(int)
            ref = np.sort(b[b[:, :, 3] > 127][:, :3].astype(float), axis=0)
        lit = []
        for file in files:
            rgba = np.array(Image.open(ROOT / 'art' / 'pixellab' / name / file).convert('RGBA'))
            rgba[:, :, 3] = np.where(rgba[:, :, 3] > 127, 255, 0)
            if palette is not None:
                # What lights up keeps its colour (and glows); the rest of the figure is matched.
                keep = lit_by_effect(rgba, hues, palette)
                kept = rgba[keep].copy()
                on = rgba[:, :, 3] > 0
                px = rgba[on][:, :3].astype(float)
                # Match each channel's distribution to the base sprite's (undoes a frame lit up overall).
                for c in range(3):
                    rank = px[:, c].argsort().argsort() / max(1, len(px) - 1)
                    px[:, c] = ref[np.round(rank * (len(ref) - 1)).astype(int), c]
                near = ((px[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2).argmin(axis=1)
                rgba[on, :3] = palette[near]
                rgba[keep] = kept
                lit.append(keep)
            sprites.append(rgba)
        if name in STILL:
            # Only the glowing parts move (the acid); everything else is held at the first frame.
            first = sprites[0]
            still = first.copy()
            still[glow_mask(first, hues)] = 0
            for k, f in enumerate(sprites):
                g = glow_mask(f, hues)
                sprites[k] = still.copy()
                sprites[k][g] = f[g]
        if lit:
            # Trim the masks with their frames.
            boxes = [np.nonzero(f[:, :, 3]) for f in sprites]
            lit = [m[ys.min():ys.max() + 1, xs.min():xs.max() + 1] for m, (ys, xs) in zip(lit, boxes)]
        sprites = [trim(f) for f in sprites]
        meta.append(write_strip(name, sprites, hues, lit or None))
    rigs = {}
    for name, hues in RIGGED:
        meta += write_rigged(name, hues, rigs)
    weapons = write_weapons(meta)
    pts = lambda h: '[' + ', '.join(f'[{x}, {y}, {t}]' for x, y, t in h) + ']'
    lines = [
        '// Generated by scripts/sprites.py — do not edit by hand.',
        '/** Sprite strips in public/sprites: frame size, and `ax` = the feet\'s x (they stand on the bottom row). Row 2 is the glow mask. */',
        'export const SHEETS = {',
        *[f"  {n}: {{ file: 'sprites/{n}.png', frames: {c}, w: {w}, h: {h}, ax: {a} }}," for n, c, w, h, a in meta],
        '} as const;',
        '',
        'export type SheetId = keyof typeof SHEETS;',
        '',
        '/**',
        ' * Rigged sheets (scripts/rig.py). `anims`: each animation\'s [first frame, frames in its idle loop, frame count];',
        ' * `hands`: per frame, where the weapon hand grips (x, y from the feet) and the weapon\'s angle (radians);',
        ' * `front`: the same for the front (far) hand, which holds sidearms.',
        ' */',
        'export const RIGS = {',
        *[f"  {n}: {{ anims: {{ {', '.join(f'{a}: [{s}, {l}, {c}]' for a, (s, l, c) in an.items())} }}, hands: {pts(h)}, front: {pts(f)} }}," for n, (an, h, f) in rigs.items()],
        '} as const;',
        '',
        '/** Weapon sprites: frame in the `weapons` sheet, the grip (where the hand holds it) and the muzzle, in the frame\'s pixels. */',
        'export const WEAPONS: Record<string, { frame: number; grip: readonly [number, number]; muzzle: readonly [number, number] }> = {',
        *[f"  {wid}: {{ frame: {k}, grip: [{g[0]}, {g[1]}], muzzle: [{m[0]}, {m[1]}] }}," for wid, k, g, m in weapons],
        '};',
        '',
    ]
    TS.write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
