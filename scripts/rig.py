"""
Skeleton rigs and reusable humanoid animation templates.

A character's rig is `art/pixellab/<name>/rig.json`: the canvas size, the 18
joints of its base sprite (`base.png`, side view, facing right), the joints of
its pose bases (`base-<pose>.png`: the same character already in a stance,
e.g. aiming) and the animations it uses. Each animation starts from a pose
base, so its idle loop barely moves anything and stays clean. The animations themselves are TEMPLATES below, written
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


def P(body=(0, 0), near=None, far=None, weapon=None, absolute=False):
    """One pose: chest/head shift (pixels per 100 px of height); arm angles (upper, fore) as a change from the
    pose base's arm, or as absolute angles with absolute=True (then with the arm's full length, from the
    standing base: a pose base can show an arm foreshortened); None keeps the base arm. For melee, the
    weapon's angle (None = along the forearm)."""
    return {'body': body, 'near': near, 'far': far, 'weapon': weapon, 'absolute': absolute}


def G(body=(0, 0), hands=(0, 0), tilt=0):
    """A two-handed pose on a gun: both hands stay on it while the body moves. The gun moves by `hands`
    (same units as `body`) and turns by `tilt` degrees about the weapon hand; the elbows follow (IK)."""
    return {'body': body, 'near': None, 'far': None, 'weapon': None, 'absolute': False, 'grip': (hands, tilt)}


# Idle loop: chest and head sink and rise (about 2 px on an 80 px figure) with a slight lean, the arms
# carried along. Big enough to read at game size; the last frame leads back into the first.
BREATHE = [(0, 0), (0, 2), (1, 4), (0, 2)]

# Templates. Each starts from a pose base (a sprite of the character already in that stance,
# see rig.json "bases"), so its idle loop only nudges the base and stays clean; the attack frames move
# further. `loop` = frames of the idle loop at the start; the rest play once, on an attack.
TEMPLATES = {
    # Ranged: aiming stance breathing, then a shot (kick up and back, settle). Long guns sit in the near
    # hand (the front hand steadies the barrel), sidearms in the front hand.
    # Both hands stay on the gun: in the idle loop the body breathes and the gun bobs only a little; the
    # shot kicks the gun up and back, then it settles.
    'aim': {'base': 'aim', 'loop': 4, 'hand': 'RIGHT', 'poses': [G(b, (b[0] * 0.3, b[1] * 0.3)) for b in BREATHE] + [
        G((-2, 0), (-4, -2), -12), G((-1, 0), (-2, -1), -5)]},
    # Melee: ready stance breathing, then cocked behind the head, over the top, coming down, the strike,
    # follow-through, low finish. The weapon is in the front (far) hand here: that's the arm that swings.
    'swing': {'base': 'ready', 'loop': 4, 'hand': 'LEFT', 'poses': [P(b, weapon=-60) for b in BREATHE] + [
        P((-2, 1), None, (-125, -150), -175, absolute=True), P((-1, 0), None, (-100, -95), -120, absolute=True),
        P((1, 0), None, (-60, -40), -60, absolute=True), P((3, 2), None, (-20, 0), 0, absolute=True),
        P((3, 3), None, (20, 35), 45, absolute=True), P((2, 3), None, (50, 70), 75, absolute=True)]},
}


def load(name: str) -> dict:
    rig = json.loads((ROOT / 'art' / 'pixellab' / name / 'rig.json').read_text())
    rig['joints'] = {k: tuple(v) for k, v in rig['joints'].items()}
    for b in rig.get('bases', {}).values():
        b['joints'] = {k: tuple(v) for k, v in b['joints'].items()}
    return rig


def base_of(rig: dict, anim: str) -> tuple[str, dict]:
    """The pose base an animation starts from: (image file, joints)."""
    b = TEMPLATES[anim]['base']
    return f'base-{b}.png', rig['bases'][b]['joints']


def _angle(j: dict, a: str, b: str) -> float:
    return math.degrees(math.atan2(j[b][1] - j[a][1], j[b][0] - j[a][0]))


def _lengths(j: dict, side: str) -> tuple:
    (bx, by), (ex, ey), (wx, wy) = j[f'{side} SHOULDER'], j[f'{side} ELBOW'], j[f'{side} ARM']
    return math.hypot(ex - bx, ey - by), math.hypot(wx - ex, wy - ey)


def _arm(j: dict, side: str, angles, absolute: bool, out: dict, full: dict):
    if angles is None:
        return
    sx, sy = out[f'{side} SHOULDER']
    upper, fore = _lengths(full if absolute else j, side)
    if not absolute:
        angles = (_angle(j, f'{side} SHOULDER', f'{side} ELBOW') + angles[0], _angle(j, f'{side} ELBOW', f'{side} ARM') + angles[1])
    a, b = math.radians(angles[0]), math.radians(angles[1])
    ex, ey = sx + upper * math.cos(a), sy + upper * math.sin(a)
    out[f'{side} ELBOW'] = (ex, ey)
    out[f'{side} ARM'] = (ex + fore * math.cos(b), ey + fore * math.sin(b))


def _ik(shoulder, wrist, upper, fore, bend):
    """Elbow for a wrist at `wrist` (clamped to the arm's reach), bent to the same side as `bend` (+1/-1)."""
    sx, sy = shoulder
    dx, dy = wrist[0] - sx, wrist[1] - sy
    d = min(math.hypot(dx, dy), upper + fore - 0.01) or 0.01
    a = math.acos(max(-1, min(1, (upper ** 2 + d ** 2 - fore ** 2) / (2 * upper * d))))
    base = math.atan2(dy, dx) - bend * a
    ex, ey = sx + upper * math.cos(base), sy + upper * math.sin(base)
    fa = math.atan2(wrist[1] - ey, wrist[0] - ex)
    return (ex, ey), (ex + fore * math.cos(fa), ey + fore * math.sin(fa))


def _grip(j: dict, pose: dict, k: float, out: dict):
    """Both hands on the gun: move/turn the base hands with the gun, solve the elbows."""
    (hx, hy), tilt = pose['grip']
    ox, oy = j['RIGHT ARM']
    t = math.radians(tilt)
    for side in ('RIGHT', 'LEFT'):
        wx, wy = j[f'{side} ARM']
        rx, ry = wx - ox, wy - oy
        target = (ox + rx * math.cos(t) - ry * math.sin(t) + hx * k, oy + rx * math.sin(t) + ry * math.cos(t) + hy * k)
        (sx, sy), (ex, ey) = j[f'{side} SHOULDER'], j[f'{side} ELBOW']
        bend = 1 if (wx - sx) * (ey - sy) - (wy - sy) * (ex - sx) < 0 else -1
        out[f'{side} ELBOW'], out[f'{side} ARM'] = _ik(out[f'{side} SHOULDER'], target, *_lengths(j, side), bend)


def pose_joints(j: dict, pose: dict, full: dict | None = None) -> dict:
    """The 18 joints of a pose, from the joints `j` of its base sprite (pixels); `full`: the standing base's
    joints (true arm lengths, for absolute arm angles)."""
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
    _arm(j, 'RIGHT', pose['near'], pose['absolute'], out, full or j)
    _arm(j, 'LEFT', pose['far'], pose['absolute'], out, full or j)
    if 'grip' in pose:
        _grip(j, pose, k, out)
    return out


def anim_joints(rig: dict, anim: str) -> list:
    _, j = base_of(rig, anim)
    return [pose_joints(j, p, rig['joints']) for p in TEMPLATES[anim]['poses']]


def frames(rig: dict) -> list:
    """Frames of the character's sprite sheet, in order: (animation, index)."""
    return [(a, i) for a in rig['animations'] for i in range(len(TEMPLATES[a]['poses']))]


def arm(rig: dict, anim: str, i: int, side: str) -> tuple:
    """(shoulder, elbow, wrist) of an arm in a frame, as posed (canvas pixels)."""
    p = anim_joints(rig, anim)[i]
    return p[f'{side} SHOULDER'], p[f'{side} ELBOW'], p[f'{side} ARM']


def hand(rig: dict, anim: str, i: int, side: str = 'RIGHT') -> tuple:
    """Where a hand grips in a frame (canvas pixels) and the weapon's angle (radians). The near (RIGHT)
    hand holds the weapon; the far (LEFT) one is the front hand for one-handed guns."""
    pose = TEMPLATES[anim]['poses'][i]
    p = anim_joints(rig, anim)[i]
    (ex, ey), (wx, wy) = p[f'{side} ELBOW'], p[f'{side} ARM']
    fore = math.atan2(wy - ey, wx - ex)
    x, y = wx + math.cos(fore) * 2, wy + math.sin(fore) * 2  # the fist sits just past the wrist
    if 'grip' in pose:  # on a gun: the base forearm's line, turned with the gun
        _, j = base_of(rig, anim)
        return x, y, math.atan2(j[f'{side} ARM'][1] - j[f'{side} ELBOW'][1], j[f'{side} ARM'][0] - j[f'{side} ELBOW'][0]) + math.radians(pose['grip'][1])
    return x, y, math.radians(pose['weapon']) if pose['weapon'] is not None else fore


def keypoints(rig: dict, joints: dict, anim: str | None = None) -> list:
    """Joints as PixelLab wants them: fractions of the canvas. An animation that reaches past the base sprite's
    canvas (a swing) is drawn on a bigger one (rig.json `wide`), the base padded right and down."""
    W, H = rig.get('wide', {}).get(anim, rig['canvas'])
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
    rows = [[None]] + [[(a, i) for i in range(len(TEMPLATES[a]['poses']))] for a in rig['animations']]
    cols = max(len(r) for r in rows)
    sprite = lambda f: Image.open(ROOT / 'art' / 'pixellab' / name / f).convert('RGBA').resize((W * s, H * s), Image.NEAREST)
    base = sprite('base.png')
    img = Image.new('RGBA', (W * s * cols, H * s * len(rows)), (30, 26, 36, 255))
    d = ImageDraw.Draw(img)
    for r, row in enumerate(rows):
        for c, fr in enumerate(row):
            ox, oy = c * W * s, r * H * s
            if fr is None:
                img.alpha_composite(base, (ox, oy))
                p = rig['joints']
            else:
                ghost = sprite(base_of(rig, fr[0])[0])
                ghost.putalpha(ghost.getchannel('A').point(lambda a: a // 2 if c == 0 else a // 4))
                img.alpha_composite(ghost, (ox, oy))
                p = anim_joints(rig, fr[0])[fr[1]]
            for a, b in bones:
                col = (255, 120, 80) if 'RIGHT' in a + b else (80, 180, 255) if 'LEFT' in a + b else (230, 230, 230)
                d.line([(ox + p[a][0] * s, oy + p[a][1] * s), (ox + p[b][0] * s, oy + p[b][1] * s)], fill=col, width=2)
            if fr is not None:
                x, y, ang = hand(rig, *fr, TEMPLATES[fr[0]].get('hand', 'RIGHT'))
                d.line([(ox + x * s, oy + y * s), (ox + (x + math.cos(ang) * 10) * s, oy + (y + math.sin(ang) * 10) * s)], fill=(255, 230, 90), width=3)
    out = ROOT / 'test-results' / f'rig-{name}.png'
    out.parent.mkdir(exist_ok=True)
    img.save(out)
    print(f'Wrote {out}')


if __name__ == '__main__':
    cmd, name = sys.argv[1], sys.argv[2]
    if cmd == 'keypoints':
        rig, anim = load(name), sys.argv[3]
        print(json.dumps({'first_frame': base_of(rig, anim)[0], 'canvas': rig.get('wide', {}).get(anim, rig['canvas']),
                          'first_frame_keypoints': keypoints(rig, base_of(rig, anim)[1], anim),
                          'keypoints': [keypoints(rig, p, anim) for p in anim_joints(rig, anim)]}))
    else:
        preview(name)
