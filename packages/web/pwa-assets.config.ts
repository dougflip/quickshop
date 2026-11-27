// App icons, generated from public/icon.svg with `npm run icons -w @quickshop/web`. The PNGs are
// committed. The SVG is already a full-bleed green square with the basket in the safe area, so no
// size gets extra padding.
import { defineConfig, minimal2023Preset as preset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...preset,
    transparent: { ...preset.transparent, padding: 0 },
    maskable: { ...preset.maskable, padding: 0 },
    apple: { ...preset.apple, padding: 0 },
  },
  images: ["public/icon.svg"],
});
