"""
Builds apps/web/src/lib/media/watermark-glyphs.json from the bundled Archivo font:
vector outlines for printable ASCII at the brand's plate weight and width, so the
server can draw the watermark without any fonts installed.

  pip install fonttools brotli
  python3 scripts/assets/build-watermark-glyphs.py
"""
import json
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/web/src/fonts/archivo-variable.woff2"
OUT = ROOT / "apps/web/src/lib/media/watermark-glyphs.json"

font = TTFont(SRC)
static = instancer.instantiateVariableFont(font, {"wght": 800, "wdth": 82})
glyph_set = static.getGlyphSet()
cmap = static.getBestCmap()
upem = static["head"].unitsPerEm
ascender = static["hhea"].ascent

glyphs = {}
for code in range(32, 127):
    name = cmap.get(code)
    if name is None:
        continue
    pen = SVGPathPen(glyph_set)
    # Flip Y so outlines read top-down like SVG, with the baseline at y = ascender.
    glyph_set[name].draw(TransformPen(pen, (1, 0, 0, -1, 0, ascender)))
    glyphs[chr(code)] = {"d": pen.getCommands(), "advance": glyph_set[name].width}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"unitsPerEm": upem, "ascender": ascender, "capHeight": static["OS/2"].sCapHeight, "glyphs": glyphs}, separators=(",", ":")))
print(f"Wrote {len(glyphs)} glyphs ({OUT.stat().st_size // 1024} KB) to {OUT.relative_to(ROOT)}")
