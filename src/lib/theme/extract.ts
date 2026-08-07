// Color extraction from logos / cover images using node-vibrant (browser build).
// Falls back gracefully when image is missing or CORS-blocked.

import { Vibrant } from "node-vibrant/browser";

export interface ExtractedPalette {
  primary?: string;
  accent?: string;
  background?: string;
}

const cache = new Map<string, ExtractedPalette>();

export async function extractPalette(imageUrl: string): Promise<ExtractedPalette> {
  if (!imageUrl) return {};
  if (cache.has(imageUrl)) return cache.get(imageUrl)!;

  try {
    const palette = await Vibrant.from(imageUrl).getPalette();
    const result: ExtractedPalette = {
      primary: palette.Vibrant?.hex || palette.DarkVibrant?.hex || palette.Muted?.hex,
      accent: palette.LightVibrant?.hex || palette.LightMuted?.hex || palette.Vibrant?.hex,
      background: palette.LightMuted?.hex || palette.Muted?.hex,
    };
    cache.set(imageUrl, result);
    return result;
  } catch {
    return {};
  }
}
