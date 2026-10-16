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
only trimmed and lined up on their feet (step 4), never resized or recoloured.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
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
    ('officer', ['security-idle.png', 'security-aim.png'], False, [(165, 200)], SCALE),
    ('brood_minions', 'brood-minions.png', True, [(255, 300)], SCALE),
]


# PixelLab sheets: name, frame files in art/pixellab/<name>/ (in order), glow hue ranges.
# The matriarch: an 8-frame idle loop, then a 5-frame claw swipe (wind-up, strike, recover).
PIXEL = [
    ('plague_matriarch', [f'idle-{i}.png' for i in range(1, 9)] + [f'attack-{i}.png' for i in range(4, 9)], []),
]


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


def feet(s: np.ndarray) -> int:
    """x of the feet: the middle of the lowest fifth of the figure."""
    ys, xs = np.nonzero(s[:, :, 3])
    return int(round(xs[ys > ys.max() - s.shape[0] // 5].mean()))


def write_strip(name: str, sprites: list[np.ndarray], hues) -> tuple:
    """Lines the frames up on their feet and writes the strip (row 2: glow mask)."""
    left = max(feet(s) for s in sprites) + 2
    right = max(s.shape[1] - feet(s) for s in sprites) + 2
    fw, ax = left + right, left
    fh = max(s.shape[0] for s in sprites) + 2
    sheet = np.zeros((fh * 2, fw * len(sprites), 4), np.uint8)
    for k, s in enumerate(sprites):
        bottom = np.nonzero(s[:, :, 3])[0].max()
        ox, oy = k * fw + ax - feet(s), fh - 1 - bottom
        sheet[oy:oy + s.shape[0], ox:ox + s.shape[1]][s[:, :, 3] > 0] = s[s[:, :, 3] > 0]
        g = glow_mask(s, hues)
        region = sheet[fh + oy:fh + oy + s.shape[0], ox:ox + s.shape[1]]
        region[g] = [255, 255, 255, 255]
    Image.fromarray(sheet).save(OUT / f'{name}.png')
    print(f'{name}: {len(sprites)} frames of {fw}×{fh}')
    return (name, len(sprites), fw, fh, ax)


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
        for file in files:
            rgba = np.array(Image.open(ROOT / 'art' / 'pixellab' / name / file).convert('RGBA'))
            rgba[:, :, 3] = np.where(rgba[:, :, 3] > 127, 255, 0)
            sprites.append(trim(rgba))
        meta.append(write_strip(name, sprites, hues))
    lines = [
        '// Generated by scripts/sprites.py — do not edit by hand.',
        '/** Sprite strips in public/sprites: frame size, and `ax` = the feet\'s x (they stand on the bottom row). Row 2 is the glow mask. */',
        'export const SHEETS = {',
        *[f"  {n}: {{ file: 'sprites/{n}.png', frames: {c}, w: {w}, h: {h}, ax: {a} }}," for n, c, w, h, a in meta],
        '} as const;',
        '',
        'export type SheetId = keyof typeof SHEETS;',
        '',
    ]
    TS.write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
