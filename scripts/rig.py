"""
The officer's skeleton rig: the joints of the base sprite
(art/pixellab/officer/base.png) and every animation as a list of poses.

PixelLab's "animate with skeleton" draws the officer in exactly these poses,
so the game knows where the hands are in every frame without guessing: the
weapon is drawn by code at the weapon hand, at the forearm's angle (see
src/render/sprites/hero.ts). That is the "layered" part: body frames from
PixelLab, weapons and muzzle flashes from code, glued by the rig.

    python3 scripts/rig.py keypoints <animation>   JSON for a PixelLab request
    python3 scripts/rig.py preview                 stick figures → test-results/rig.png

The sprite faces right (east). RIGHT = the near side (towards the camera),
LEFT = the far side. "ARM" / "LEG" are the wrist and ankle. The weapon is held
in the near (right, cybernetic) hand; the far hand supports long guns.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H = 80, 112  # base sprite canvas

# Joints of the base sprite (pixels).
BASE = {
    'NOSE': (57, 20), 'RIGHT EYE': (54, 16), 'LEFT EYE': (56, 16), 'RIGHT EAR': (49, 17), 'LEFT EAR': (51, 17),
    'NECK': (51, 27),
    'RIGHT SHOULDER': (41, 32), 'RIGHT ELBOW': (36, 46), 'RIGHT ARM': (32, 59),
    'LEFT SHOULDER': (50, 33), 'LEFT ELBOW': (58, 48), 'LEFT ARM': (63, 61),
    'RIGHT HIP': (40, 59), 'RIGHT KNEE': (37, 78), 'RIGHT LEG': (30, 98),
    'LEFT HIP': (48, 60), 'LEFT KNEE': (57, 77), 'LEFT LEG': (58, 97),
}
NEAR = 10   # z_index for the near side
FAR = 0
HEAD = ('NOSE', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR')
UPPER = HEAD + ('NECK', 'RIGHT SHOULDER', 'LEFT SHOULDER')


def z(label: str) -> int:
    return NEAR if label.startswith('RIGHT') else FAR if label.startswith('LEFT') else 5


def pose(**moves) -> dict:
    """The base pose with some joints moved: name=(x, y) absolute, or dy/dx shifts via `shift`."""
    p = dict(BASE)
    for k, v in moves.items():
        p[k.replace('_', ' ')] = v
    return p


def shifted(p: dict, labels, dx=0, dy=0) -> dict:
    q = dict(p)
    for k in labels:
        x, y = q[k]
        q[k] = (x + dx, y + dy)
    return q


def breathe(p: dict, dy: int) -> dict:
    """Chest and head rise and fall; the arms follow."""
    arms = ('RIGHT ELBOW', 'RIGHT ARM', 'LEFT ELBOW', 'LEFT ARM')
    return shifted(shifted(p, UPPER, dy=dy), arms, dy=dy)


# ─── Poses ────────────────────────────────────────────────────────────────

# Ranged: near arm straight out at shoulder height, far hand under the grip.
AIM = pose(RIGHT_ELBOW=(52, 34), RIGHT_ARM=(64, 33), LEFT_ELBOW=(57, 42), LEFT_ARM=(64, 36))
# Melee ready: weapon hand low in front, far arm back for balance.
READY = pose(RIGHT_ELBOW=(44, 44), RIGHT_ARM=(54, 50), LEFT_ELBOW=(56, 46), LEFT_ARM=(60, 56))

ANIMATIONS = {
    # Standing, empty hands: breathing.
    'idle': [breathe(BASE, d) for d in (0, 0, 1, 1, 1, 1, 0, 0)],
    # Aiming: breathing, then a shot (kick up and back, settle).
    'aim': [breathe(AIM, d) for d in (0, 0, 1, 1)] + [
        shifted(AIM, ('RIGHT ARM', 'LEFT ARM'), dx=-2, dy=-3),
        shifted(shifted(AIM, ('RIGHT ARM', 'LEFT ARM'), dx=-1, dy=-1), UPPER, dx=-1),
    ],
    # Melee: ready breathing, then wind up over the shoulder and cut down through the target.
    'swing': [breathe(READY, d) for d in (0, 0, 1, 1)] + [
        pose(RIGHT_ELBOW=(40, 24), RIGHT_ARM=(38, 12), LEFT_ELBOW=(56, 44), LEFT_ARM=(62, 50)),
        pose(RIGHT_ELBOW=(50, 26), RIGHT_ARM=(60, 18), LEFT_ELBOW=(55, 44), LEFT_ARM=(60, 52)),
        shifted(pose(RIGHT_ELBOW=(54, 38), RIGHT_ARM=(68, 44), LEFT_ELBOW=(50, 46), LEFT_ARM=(46, 56)), UPPER, dx=2, dy=2),
        shifted(pose(RIGHT_ELBOW=(52, 46), RIGHT_ARM=(62, 58), LEFT_ELBOW=(48, 48), LEFT_ARM=(42, 58)), UPPER, dx=1, dy=1),
    ],
}


# Weapon angle per frame (radians, 0 = forward, negative = up). Guns follow the
# forearm; a melee weapon is held like a sword, so its angle is set per pose.
WEAPON_ANGLE = {
    'swing': [-0.9, -0.9, -0.9, -0.9, -2.7, -1.3, 0.45, 0.9],
}

# Frames in the sprite sheet, in order: (animation, frame index).
FRAMES = [(name, i) for name in ('aim', 'swing') for i in range(len(ANIMATIONS[name]))]


def hand(name: str, i: int) -> tuple[float, float, float]:
    """Where the weapon hand grips in frame i of an animation (canvas pixels) and the weapon's angle."""
    import math
    p = ANIMATIONS[name][i]
    (ex, ey), (wx, wy) = p['RIGHT ELBOW'], p['RIGHT ARM']
    fore = math.atan2(wy - ey, wx - ex)
    # The fist sits a little past the wrist.
    x, y = wx + math.cos(fore) * 2, wy + math.sin(fore) * 2
    angles = WEAPON_ANGLE.get(name)
    return x, y, angles[i] if angles else fore


def keypoints(p: dict) -> list:
    return [{'label': k, 'x': round(x / W, 4), 'y': round(y / H, 4), 'z_index': z(k)} for k, (x, y) in p.items()]


def preview():
    from PIL import Image, ImageDraw
    bones = [('NECK', 'NOSE'), ('NECK', 'RIGHT SHOULDER'), ('NECK', 'LEFT SHOULDER'), ('RIGHT SHOULDER', 'RIGHT ELBOW'),
             ('RIGHT ELBOW', 'RIGHT ARM'), ('LEFT SHOULDER', 'LEFT ELBOW'), ('LEFT ELBOW', 'LEFT ARM'), ('NECK', 'RIGHT HIP'),
             ('NECK', 'LEFT HIP'), ('RIGHT HIP', 'RIGHT KNEE'), ('RIGHT KNEE', 'RIGHT LEG'), ('LEFT HIP', 'LEFT KNEE'), ('LEFT KNEE', 'LEFT LEG')]
    s = 4
    rows = list(ANIMATIONS.items())
    cols = max(len(f) for _, f in rows)
    base = Image.open(ROOT / 'art' / 'pixellab' / 'officer' / 'base.png').convert('RGBA').resize((W * s, H * s), Image.NEAREST)
    img = Image.new('RGBA', (W * s * cols, H * s * len(rows)), (30, 26, 36, 255))
    for r, (_, frames) in enumerate(rows):
        for c, p in enumerate(frames):
            ox, oy = c * W * s, r * H * s
            ghost = base.copy()
            ghost.putalpha(ghost.getchannel('A').point(lambda a: a // 4))
            img.alpha_composite(ghost, (ox, oy))
            d = ImageDraw.Draw(img)
            for a, b in bones:
                col = (255, 120, 80) if 'RIGHT' in a + b else (80, 180, 255) if 'LEFT' in a + b else (230, 230, 230)
                d.line([(ox + p[a][0] * s, oy + p[a][1] * s), (ox + p[b][0] * s, oy + p[b][1] * s)], fill=col, width=3)
    out = ROOT / 'test-results' / 'rig.png'
    out.parent.mkdir(exist_ok=True)
    img.save(out)
    print(f'Wrote {out}')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    if cmd == 'keypoints':
        print(json.dumps({'first_frame_keypoints': keypoints(BASE), 'keypoints': [keypoints(p) for p in ANIMATIONS[sys.argv[2]]]}))
    else:
        preview()
