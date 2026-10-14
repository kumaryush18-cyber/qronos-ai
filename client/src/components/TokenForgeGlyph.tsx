import { QronosGlyph, type QronosGlyphProps } from "./QronosGlyph";

/** Re-export for compatibility — renders the official Qronos AI Glyph. */
export function TokenForgeGlyph(props: QronosGlyphProps) {
  return <QronosGlyph {...props} />;
}

