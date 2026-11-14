import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The built pages only talk to the Supabase project and the weather service (not applied in dev: Vite needs inline scripts)
const csp = (): Plugin => ({
  name: "hestia-csp",
  apply: "build",
  transformIndexHtml: (html) => html.replace("<!--csp-->",
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'">`),
});

export default defineConfig({
  // Relative paths: the same build works at https://<user>.github.io/hestia/ and at a domain's root
  base: "./",
  resolve: { alias: { "@shared": fileURLToPath(new URL("./supabase/functions/_shared", import.meta.url)) } },
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version), __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    csp(),
    VitePWA({
      strategies: "injectManifest", // our own service worker (src/sw.ts): offline copy + push notifications
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      injectManifest: { globPatterns: ["**/*.{js,css,html,woff2,png,svg,webmanifest}"] },
      manifest: {
        name: "Hestia",
        short_name: "Hestia",
        description: "La maison en un coup d'œil : calendrier, repas, courses, tâches.",
        lang: "fr-CA",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#eef3f1",
        theme_color: "#1f6f78",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Courses", url: "./#/shopping", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
          { name: "Tâches", url: "./#/chores", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
          { name: "Kiosque", url: "./#/kiosk", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
        ],
      },
    }),
  ],
  test: { include: ["tests/**/*.test.ts"] },
});
