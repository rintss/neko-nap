import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const githubPagesBase = process.env["GITHUB_ACTIONS"] ? "/neko-nap/" : "/";

export default defineConfig({
  base: githubPagesBase,
  server: {
    host: "::",
    port: 8080,
  },
  preview: {
    host: "127.0.0.1",
  },
  css: {
    transformer: "lightningcss",
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      prerender: { enabled: true, crawlLinks: false },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    // GitHub Pages only publishes the prerendered public directory. The Node
    // preset gives TanStack a local renderer without pulling in a host-specific CLI.
    nitro({ preset: "node-server" }),
    react(),
  ],
});
