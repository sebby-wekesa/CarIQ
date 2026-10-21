import "server-only";
import glyphData from "./watermark-glyphs.json";

type Glyph = { d: string; advance: number };
const font = glyphData as { unitsPerEm: number; ascender: number; capHeight: number; glyphs: Record<string, Glyph> };

/**
 * The brand name as an SVG watermark, drawn from pre-built font outlines so it
 * renders identically on any server (no system fonts needed). Sized relative to
 * the photo so it reads on a phone screen without covering the car.
 * Regenerate the outlines with scripts/assets/build-watermark-glyphs.py.
 */
export function watermarkSvg(text: string, imageWidth: number): { svg: Buffer; width: number; height: number } {
  const label = text.toUpperCase();
  const capPx = Math.round(Math.min(Math.max(imageWidth * 0.024, 14), 40));
  const scale = capPx / font.capHeight;
  const tracking = font.unitsPerEm * 0.08;
  const padX = Math.round(capPx * 0.7);
  const padY = Math.round(capPx * 0.5);

  let cursor = 0;
  const paths: string[] = [];
  for (const char of label) {
    const glyph = font.glyphs[char] ?? font.glyphs["?"];
    if (!glyph) continue;
    if (glyph.d) paths.push(`<path transform="translate(${cursor} 0)" d="${glyph.d}"/>`);
    cursor += glyph.advance + tracking;
  }
  const textWidthUnits = Math.max(cursor - tracking, 0);

  const width = Math.ceil(textWidthUnits * scale + padX * 2);
  const height = Math.ceil(capPx + padY * 2);
  // Outlines sit with their baseline at `ascender`; shift so cap tops touch padY.
  const offsetY = padY - (font.ascender - font.capHeight) * scale;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" rx="${Math.round(height / 2)}" fill="#10231c" fill-opacity="0.42"/>
  <g transform="translate(${padX} ${offsetY}) scale(${scale})" fill="#ffffff" fill-opacity="0.9">${paths.join("")}</g>
</svg>`;
  return { svg: Buffer.from(svg), width, height };
}
