"""
Builds public/fonts/starward-pixel.woff, the game's pixel font, from the
bitmaps below. Every glyph pixel becomes a square, so the font is crisp at
whole multiples of 10px (10px = 1 screen pixel per font pixel, 20px = 2…).

    python3 scripts/pixel-font.py      (needs fontTools: pip install fonttools)

Grid: 9 rows. Rows 0–6 sit on and above the baseline (capitals are 7 tall,
lower case 5), rows 7–8 hang below it. Glyphs listed with fewer rows are
padded at the bottom; lower case listed with 5–7 rows starts at row 2.
"""
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

PX = 100          # font units per pixel
EM = 10 * PX      # 10 pixels per em
ASCENT, DESCENT = 8 * PX, 2 * PX

CAPS = {
    'A': ".###. #...# #...# ##### #...# #...# #...#",
    'B': "####. #...# #...# ####. #...# #...# ####.",
    'C': ".###. #...# #.... #.... #.... #...# .###.",
    'D': "####. #...# #...# #...# #...# #...# ####.",
    'E': "##### #.... #.... ####. #.... #.... #####",
    'F': "##### #.... #.... ####. #.... #.... #....",
    'G': ".###. #...# #.... #.### #...# #...# .####",
    'H': "#...# #...# #...# ##### #...# #...# #...#",
    'I': "### .#. .#. .#. .#. .#. ###",
    'J': "..### ...#. ...#. ...#. #..#. #..#. .##..",
    'K': "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
    'L': "#.... #.... #.... #.... #.... #.... #####",
    'M': "#...# ##.## #.#.# #.#.# #...# #...# #...#",
    'N': "#...# ##..# #.#.# #..## #...# #...# #...#",
    'O': ".###. #...# #...# #...# #...# #...# .###.",
    'P': "####. #...# #...# ####. #.... #.... #....",
    'Q': ".###. #...# #...# #...# #.#.# #..#. .##.#",
    'R': "####. #...# #...# ####. #.#.. #..#. #...#",
    'S': ".#### #.... #.... .###. ....# ....# ####.",
    'T': "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
    'U': "#...# #...# #...# #...# #...# #...# .###.",
    'V': "#...# #...# #...# #...# #...# .#.#. ..#..",
    'W': "#...# #...# #...# #.#.# #.#.# ##.## #...#",
    'X': "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
    'Y': "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
    'Z': "##### ....# ...#. ..#.. .#... #.... #####",
    '0': ".###. #...# #..## #.#.# ##..# #...# .###.",
    '1': ".#. ##. .#. .#. .#. .#. ###",
    '2': ".###. #...# ....# ...#. ..#.. .#... #####",
    '3': "####. ....# ....# .###. ....# ....# ####.",
    '4': "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
    '5': "##### #.... ####. ....# ....# #...# .###.",
    '6': ".###. #.... #.... ####. #...# #...# .###.",
    '7': "##### ....# ...#. ..#.. .#... .#... .#...",
    '8': ".###. #...# #...# .###. #...# #...# .###.",
    '9': ".###. #...# #...# .#### ....# ....# .###.",
}

# Full 9-row (or 7-row) bitmaps from the top of the grid.
TALL = {
    'b': "#.... #.... ####. #...# #...# #...# ####.",
    'd': "....# ....# .#### #...# #...# #...# .####",
    'f': "..## .#.. #### .#.. .#.. .#.. .#..",
    'h': "#.... #.... ####. #...# #...# #...# #...#",
    'i': "# . # # # # #",
    'j': "..# ... ..# ..# ..# ..# ..# ..# ##.",
    'k': "#... #... #..# #.#. ##.. #.#. #..#",
    'l': "#. #. #. #. #. #. .#",
    't': ".#. .#. ### .#. .#. .#. ..#",
    '!': "# # # # # . #",
    '"': "#.# #.#",
    "'": "# #",
    '(': ".# #. #. #. #. #. .#",
    ')': "#. .# .# .# .# .# #.",
    '[': "## #. #. #. #. #. ##",
    ']': "## .# .# .# .# .# ##",
    '/': "....# ...#. ...#. ..#.. .#... .#... #....",
    '?': ".###. #...# ....# ...#. ..#.. ..... ..#..",
    '%': "##..# ##.#. ...#. ..#.. .#... .#.## #..##",
    '&': ".##.. #..#. .##.. .#... #.#.# #..#. .##.#",
    '#': "..... .#.#. ##### .#.#. ##### .#.#.",
    '|': "# # # # # # # # #",
    '±': "..#.. ..#.. ##### ..#.. ..#.. ..... #####",
    '▸': "..... #... ##.. ###. ##.. #...",
    '◂': "..... ...# ..## .### ..## ...#",
    '→': "..... ...#.. ....#. ###### ....#. ...#..",
    '←': "..... ..#... .#.... ###### .#.... ..#...",
    '’': "# #",
    '‘': "# #",
    '“': "#.# #.#",
    '”': "#.# #.#",
}

# Lower case and small marks: bitmaps starting at row 2 (x-height).
LOW = {
    'a': ".###. ....# .#### #...# .####",
    'c': ".### #... #... #... .###",
    'e': ".###. #...# ##### #.... .###.",
    'g': ".#### #...# #...# #...# .#### ....# .###.",
    'm': "##.#. #.#.# #.#.# #.#.# #.#.#",
    'n': "####. #...# #...# #...# #...#",
    'o': ".###. #...# #...# #...# .###.",
    'p': "####. #...# #...# #...# ####. #.... #....",
    'q': ".#### #...# #...# #...# .#### ....# ....#",
    'r': "#.## ##.. #... #... #...",
    's': ".#### #.... .###. ....# ####.",
    'u': "#...# #...# #...# #...# .####",
    'v': "#...# #...# #...# .#.#. ..#..",
    'w': "#...# #...# #.#.# #.#.# .#.#.",
    'x': "#...# .#.#. ..#.. .#.#. #...#",
    'y': "#...# #...# #...# #...# .#### ....# .###.",
    'z': "##### ...#. ..#.. .#... #####",
    ':': "# . . #",
    ';': ".# .. .. .# .# #.",
    '.': ". . . . #",
    ',': ". . . .# .# #.",
    '-': "... ... ###",
    '−': ".... .... ####",
    '–': ".... .... ####",
    '—': "...... ...... ######",
    '+': "..#.. ..#.. ##### ..#.. ..#..",
    '=': ".... #### .... ####",
    '*': "#.# .#. #.#",
    '×': "#.# .#. #.#",
    '·': ". . #",
    '<': "..# .#. #.. .#. ..#",
    '>': "#.. .#. ..# .#. #..",
    '›': "#.. .#. ..# .#. #..",
    '‹': "..# .#. #.. .#. ..#",
    '»': "#.#.. .#.#. ..#.# .#.#. #.#..",
    '«': "..#.# .#.#. #.#.. .#.#. ..#.#",
    '_': ". . . . . . #####",
    '…': ". . . . #.#.#",
    '°': ".#. #.# .#.",
}
# Glyphs that sit higher than row 2.
RAISE = {'*': 1, '°': 2, '=': 0, '+': 0, '×': 0}

GAP = 1   # pixels between letters
SPACE = 3


def rows_of(spec: str, start: int) -> list[str]:
    rows = spec.split(' ')
    return [''] * start + rows


def glyph_rows() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for ch, spec in CAPS.items():
        out[ch] = rows_of(spec, 0)
    for ch, spec in TALL.items():
        out[ch] = rows_of(spec, 0)
    for ch, spec in LOW.items():
        out[ch] = rows_of(spec, 2 - RAISE.get(ch, 0))
    return out


def draw(rows: list[str], width: int):
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] != '#':
                x += 1
                continue
            start = x
            while x < len(row) and row[x] == '#':
                x += 1
            top, bottom = (7 - r) * PX, (6 - r) * PX
            # Clockwise (TrueType outer contour).
            pen.moveTo((start * PX, bottom))
            pen.lineTo((start * PX, top))
            pen.lineTo((x * PX, top))
            pen.lineTo((x * PX, bottom))
            pen.closePath()
    return pen.glyph()


def main():
    glyphs = glyph_rows()
    order = ['.notdef', 'space'] + [f'uni{ord(c):04X}' for c in glyphs]
    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {32: 'space'}
    outlines = {'.notdef': draw(["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"], 5), 'space': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (6 * PX, 0), 'space': (SPACE * PX, 0)}
    for ch, rows in glyphs.items():
        name = f'uni{ord(ch):04X}'
        width = max(len(r) for r in rows)
        outlines[name] = draw(rows, width)
        metrics[name] = ((width + GAP) * PX, 0)
        cmap[ord(ch)] = name
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(outlines)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=-DESCENT)
    fb.setupNameTable({'familyName': 'Starward Pixel', 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=ASCENT, sTypoDescender=-DESCENT, sTypoLineGap=0, usWinAscent=ASCENT, usWinDescent=DESCENT,
                sxHeight=5 * PX, sCapHeight=7 * PX, fsType=0)
    fb.setupPost()
    out = Path(__file__).resolve().parent.parent / 'public' / 'fonts' / 'starward-pixel.woff'
    out.parent.mkdir(parents=True, exist_ok=True)
    fb.font.flavor = 'woff'
    fb.save(str(out))
    print(f'Wrote {out} ({len(glyphs)} glyphs, {out.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
