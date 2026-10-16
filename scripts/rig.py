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
    pose base's arm, or as absolute angles with absolute=True; None keeps the base arm. For melee, the
    weapon's angle (None = along the forearm)."""
    return {'body': body, 'near': near, 'far': far, 'weapon': weapon, 'absolute': absolute}


BREATHE = [(0, 0), (0, 1), (0, 1), (0, 0)]  # a loop: the last frame leads back into the first

# Templates. Each starts from a pose base (a sprite of the character already in that stance,
# see rig.json "bases"), so its idle loop only nudges the base and stays clean; the attack frames move
# further. `loop` = frames of the idle loop at the start; the rest play once, on an attack.
TEMPLATES = {
    # Ranged: aiming stance breathing, then a shot (kick up and back, settle). Long guns sit in the near
    # hand (the front hand steadies the barrel), sidearms in the front hand.
    'aim': {'base': 'aim', 'loop': 4, 'hand': 'RIGHT', 'poses': [P(b) for b in BREATHE] + [
        P((-2, 0), (-6, -22), (-6, -22)), P((-1, 0), (-2, -8), (-2, -8))]},
    # Melee: ready stance breathing, then wind-up, over the top, strike, follow-through.
    # The weapon is in the front (far) hand here: that's the arm that swings.
    'swing': {'base': 'ready', 'loop': 4, 'hand': 'LEFT', 'poses': [P(b, weapon=-60) for b in BREATHE] + [
        P((-1, 0), None, (-115, -100), -160, absolute=True), P((1, 0), None, (-60, -25), -70, absolute=True),
        P((3, 2), None, (20, 15), 25, absolute=True), P((2, 2), None, (55, 60), 55, absolute=True)]},
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


def _arm(j: dict, side: str, angles, absolute: bool, out: dict):
    if angles is None:
        return
    sx, sy = out[f'{side} SHOULDER']
    (bx, by), (ex, ey), (wx, wy) = j[f'{side} SHOULDER'], j[f'{side} ELBOW'], j[f'{side} ARM']
    upper, fore = math.hypot(ex - bx, ey - by), math.hypot(wx - ex, wy - ey)
    if not absolute:
        angles = (_angle(j, f'{side} SHOULDER', f'{side} ELBOW') + angles[0], _angle(j, f'{side} ELBOW', f'{side} ARM') + angles[1])
    a, b = math.radians(angles[0]), math.radians(angles[1])
    ex, ey = sx + upper * math.cos(a), sy + upper * math.sin(a)
    out[f'{side} ELBOW'] = (ex, ey)
    out[f'{side} ARM'] = (ex + fore * math.cos(b), ey + fore * math.sin(b))


def pose_joints(j: dict, pose: dict) -> dict:
    """The 18 joints of a pose, from the joints `j` of its base sprite (pixels)."""
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
    _arm(j, 'RIGHT', pose['near'], pose['absolute'], out)
    _arm(j, 'LEFT', pose['far'], pose['absolute'], out)
    return out


def anim_joints(rig: dict, anim: str) -> list:
    _, j = base_of(rig, anim)
    return [pose_joints(j, p) for p in TEMPLATES[anim]['poses']]


def frames(rig: dict) -> list:
    """Frames of the character's sprite sheet, in order: (animation, index)."""
    return [(a, i) for a in rig['animations'] for i in range(len(TEMPLATES[a]['poses']))]


def forearm(rig: dict, anim: str, i: int, side: str) -> tuple:
    """(elbow, wrist) of an arm in a frame, as posed (canvas pixels)."""
    p = anim_joints(rig, anim)[i]
    return p[f'{side} ELBOW'], p[f'{side} ARM']


def hand(rig: dict, anim: str, i: int, side: str = 'RIGHT') -> tuple:
    """Where a hand grips in a frame (canvas pixels) and the weapon's angle (radians). The near (RIGHT)
    hand holds the weapon; the far (LEFT) one is the front hand for one-handed guns."""
    pose = TEMPLATES[anim]['poses'][i]
    p = anim_joints(rig, anim)[i]
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
        print(json.dumps({'first_frame': base_of(rig, anim)[0], 'first_frame_keypoints': keypoints(rig, base_of(rig, anim)[1]),
                          'keypoints': [keypoints(rig, p) for p in anim_joints(rig, anim)]}))
    else:
        preview(name)
