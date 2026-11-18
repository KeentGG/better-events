import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Local API (npm run dev:api) runs on 8787, same port as `wrangler dev`. API_PROXY points the demo at 8788.
const proxy = { "/api": process.env.API_PROXY ?? "http://localhost:8787" };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Port 5180 serves the production build (`npm run serve`), kept small
  // enough to load fast on a phone. The dev server with hot reload uses 5181.
  server: {
    proxy,
    host: true,
    port: 5181,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    proxy,
    host: true,
    port: 5180,
    strictPort: true,
    allowedHosts: true,
  },
});
