"""
Skeleton rigs and reusable humanoid animation templates.

A character's rig is `art/pixellab/<name>/rig.json`: the canvas size, the 18
joints of its base sprite (`base.png`, side view, facing right) and the
animations it uses. The animations themselves are TEMPLATES below, written
as body offsets and arm angles rather than pixel positions, so the same
template fits any humanoid: arm lengths come from the character's own joints.

PixelLab's "animate with skeleton" draws the character in exactly these
poses, so the game knows where the hands are in every frame: for the player,
the weapon is drawn by code at the weapon hand (see src/render/sprites/hero.ts
and HANDS in sheet-data.ts). Body frames from PixelLab, weapons and effects
from code, glued by the rig.

    python3 scripts/rig.py keypoints <name> <animation>   JSON for a PixelLab request
    python3 scripts/rig.py preview <name>                 stick figures → test-results/rig-<name>.png

Joints: RIGHT = the near side (towards the camera), LEFT = the far side.
"ARM" / "LEG" are the wrist and ankle. The weapon is in the near hand.
Angles are in degrees on screen: 0 = forward (right), 90 = straight down,
-90 = straight up.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEAR, FAR, MID = 10, 0, 5  # z_index
UPPER = ('NOSE', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR', 'NECK', 'RIGHT SHOULDER', 'LEFT SHOULDER')


def P(body=(0, 0), near=None, far=None, weapon=None):
    """One pose: chest/head shift (pixels per 100 px of height), arm angles (upper, fore) or None to keep the
    base arm, and for melee the weapon's angle (None = along the forearm)."""
    return {'body': body, 'near': near, 'far': far, 'weapon': weapon}


# Arm positions used by several templates.
AIM_NEAR, AIM_FAR = (10, -6), (55, -35)          # gun arm straight out, far hand up under the grip
READY_NEAR, READY_FAR = (55, 20), (75, 100)       # fist low in front, far arm relaxed

# Templates. Loops are written to repeat cleanly: last frame leads back into the first.
TEMPLATES = {
    # Ranged stance, breathing (loops), then a shot: kick up and back, settle.
    'aim': [P((0, 0), AIM_NEAR, AIM_FAR), P((0, 1), AIM_NEAR, AIM_FAR), P((0, 1), (11, -5), (56, -34)), P((0, 0), AIM_NEAR, AIM_FAR),
            P((-2, 0), (2, -28), (48, -55)), P((-1, 0), (7, -14), (52, -42))],
    # Melee stance, breathing (loops), then the swing: wind-up, over the top, strike, follow-through.
    'swing': [P((0, 0), READY_NEAR, READY_FAR, -50), P((0, 1), READY_NEAR, READY_FAR, -50), P((0, 1), (56, 22), READY_FAR, -48),
              P((0, 0), READY_NEAR, READY_FAR, -50),
              P((-1, 0), (-115, -100), (70, 60), -160), P((1, 0), (-60, -25), (75, 80), -70),
              P((3, 2), (20, 15), (100, 130), 25), P((2, 2), (55, 60), (95, 120), 55)],
}
# Frames per animation that form the idle loop (the rest play once, on an attack).
LOOPS = {'aim': 4, 'swing': 4}


def load(name: str) -> dict:
    rig = json.loads((ROOT / 'art' / 'pixellab' / name / 'rig.json').read_text())
    rig['joints'] = {k: tuple(v) for k, v in rig['joints'].items()}
    return rig


def _arm(j: dict, side: str, angles, out: dict):
    if angles is None:
        return
    sx, sy = out[f'{side} SHOULDER']
    (bx, by), (ex, ey), (wx, wy) = j[f'{side} SHOULDER'], j[f'{side} ELBOW'], j[f'{side} ARM']
    upper, fore = math.hypot(ex - bx, ey - by), math.hypot(wx - ex, wy - ey)
    a, b = math.radians(angles[0]), math.radians(angles[1])
    ex, ey = sx + upper * math.cos(a), sy + upper * math.sin(a)
    out[f'{side} ELBOW'] = (ex, ey)
    out[f'{side} ARM'] = (ex + fore * math.cos(b), ey + fore * math.sin(b))


def pose_joints(rig: dict, pose: dict) -> dict:
    """The 18 joints of a pose for this character (pixels)."""
    j = rig['joints']
    k = (j['RIGHT LEG'][1] - j['NOSE'][1]) / 100  # pixels per template unit
    dx, dy = pose['body'][0] * k, pose['body'][1] * k
    out = dict(j)
    for name in UPPER:
        out[name] = (j[name][0] + dx, j[name][1] + dy)
    for side in ('RIGHT', 'LEFT'):
        if pose['near' if side == 'RIGHT' else 'far'] is None:  # base arm, carried along with the chest
            for part in ('ELBOW', 'ARM'):
                x, y = j[f'{side} {part}']
                out[f'{side} {part}'] = (x + dx, y + dy)
    _arm(j, 'RIGHT', pose['near'], out)
    _arm(j, 'LEFT', pose['far'], out)
    return out


def frames(rig: dict) -> list:
    """Frames of the character's sprite sheet, in order: (animation, index)."""
    return [(a, i) for a in rig['animations'] for i in range(len(TEMPLATES[a]))]


def hand(rig: dict, anim: str, i: int, side: str = 'RIGHT') -> tuple:
    """Where a hand grips in a frame (canvas pixels) and the weapon's angle (radians). The near (RIGHT)
    hand holds the weapon; the far (LEFT) one is the front hand for one-handed guns."""
    pose = TEMPLATES[anim][i]
    p = pose_joints(rig, pose)
    (ex, ey), (wx, wy) = p[f'{side} ELBOW'], p[f'{side} ARM']
    fore = math.atan2(wy - ey, wx - ex)
    x, y = wx + math.cos(fore) * 2, wy + math.sin(fore) * 2  # the fist sits just past the wrist
    return x, y, math.radians(pose['weapon']) if pose['weapon'] is not None else fore


def keypoints(rig: dict, joints: dict) -> list:
    W, H = rig['canvas']
    z = lambda k: NEAR if k.startswith('RIGHT') else FAR if k.startswith('LEFT') else MID
    return [{'label': k, 'x': round(x / W, 4), 'y': round(y / H, 4), 'z_index': z(k)} for k, (x, y) in joints.items()]


def preview(name: str):
    from PIL import Image, ImageDraw
    rig = load(name)
    W, H = rig['canvas']
    bones = [('NECK', 'NOSE'), ('NECK', 'RIGHT SHOULDER'), ('NECK', 'LEFT SHOULDER'), ('RIGHT SHOULDER', 'RIGHT ELBOW'),
             ('RIGHT ELBOW', 'RIGHT ARM'), ('LEFT SHOULDER', 'LEFT ELBOW'), ('LEFT ELBOW', 'LEFT ARM'), ('NECK', 'RIGHT HIP'),
             ('NECK', 'LEFT HIP'), ('RIGHT HIP', 'RIGHT KNEE'), ('RIGHT KNEE', 'RIGHT LEG'), ('LEFT HIP', 'LEFT KNEE'), ('LEFT KNEE', 'LEFT LEG')]
    s = 4
    rows = [[None]] + [[(a, i) for i in range(len(TEMPLATES[a]))] for a in rig['animations']]
    cols = max(len(r) for r in rows)
    base = Image.open(ROOT / 'art' / 'pixellab' / name / 'base.png').convert('RGBA').resize((W * s, H * s), Image.NEAREST)
    ghost = base.copy()
    ghost.putalpha(ghost.getchannel('A').point(lambda a: a // 3))
    img = Image.new('RGBA', (W * s * cols, H * s * len(rows)), (30, 26, 36, 255))
    d = ImageDraw.Draw(img)
    for r, row in enumerate(rows):
        for c, fr in enumerate(row):
            ox, oy = c * W * s, r * H * s
            img.alpha_composite(base if fr is None else ghost, (ox, oy))
            p = rig['joints'] if fr is None else pose_joints(rig, TEMPLATES[fr[0]][fr[1]])
            for a, b in bones:
                col = (255, 120, 80) if 'RIGHT' in a + b else (80, 180, 255) if 'LEFT' in a + b else (230, 230, 230)
                d.line([(ox + p[a][0] * s, oy + p[a][1] * s), (ox + p[b][0] * s, oy + p[b][1] * s)], fill=col, width=2)
            if fr is not None:
                x, y, ang = hand(rig, *fr)
                d.line([(ox + x * s, oy + y * s), (ox + (x + math.cos(ang) * 10) * s, oy + (y + math.sin(ang) * 10) * s)], fill=(255, 230, 90), width=3)
    out = ROOT / 'test-results' / f'rig-{name}.png'
    out.parent.mkdir(exist_ok=True)
    img.save(out)
    print(f'Wrote {out}')


if __name__ == '__main__':
    cmd, name = sys.argv[1], sys.argv[2]
    if cmd == 'keypoints':
        rig = load(name)
        print(json.dumps({'first_frame_keypoints': keypoints(rig, rig['joints']),
                          'keypoints': [keypoints(rig, pose_joints(rig, p)) for p in TEMPLATES[sys.argv[3]]]}))
    else:
        preview(name)
