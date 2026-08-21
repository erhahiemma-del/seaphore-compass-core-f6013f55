// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // mcpPlugin cannot start on Windows. Its `assertContains` check compares
    // Vite's `root` — which Vite normalises to forward slashes
    // ("C:/Projects/seaphore") — against a `path.resolve()`d routesDir, which
    // returns native separators ("C:\Projects\seaphore\src\routes"). The
    // `startsWith(parent + sep)` test therefore never matches and the dev
    // server throws before serving a single request. No plugin option avoids
    // it: `resolve()` always returns native separators whatever is passed.
    //
    // On POSIX `sep` is "/", both strings are identical, and the plugin works
    // — so this is skipped only on Windows. Lovable builds on Linux and is
    // unaffected, keeping MCP behaviour identical in deployment.
    plugins: process.platform === "win32" ? [] : [mcpPlugin()],
  },
});
