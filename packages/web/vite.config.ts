import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the app from https://dougflip.github.io/quickshop/.
  base: command === "build" ? "/quickshop/" : "/",
  plugins: [
    react(),
    VitePWA({
      // A plain registration script: a new version is downloaded in the background and takes
      // over the next time the app opens, never by reloading mid-trip.
      injectRegister: "script",
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon.svg"],
      manifest: {
        name: "QuickShop",
        short_name: "QuickShop",
        description: "One list for the household.",
        theme_color: "#17803d",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The whole app is saved on the phone, so it opens with no connection. Data is not
        // cached here: the engine keeps its own copy, and Supabase requests always go live.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}));
