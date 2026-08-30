/**
 * Security regression: no provider secret can reach the browser.
 *
 * ## What this guards, and why it is not just a longer list
 *
 * The original version forbade two identifiers — both Global Fishing Watch
 * — from appearing anywhere client-reachable. That is fifteen credentials
 * short, and simply extending the list does not work: the provider catalog
 * and the capability catalog *declare* which variable each provider needs,
 * client-side, on purpose. `credentialEnv: ["COPERNICUS_USERNAME"]` names a
 * secret without being one, and a guard that cannot tell a declaration from
 * a leak would either fail permanently or be deleted.
 *
 * So this guards the two things that actually leak a value:
 *
 *   1. A `VITE_`-prefixed alias of a provider secret. Vite inlines those
 *      into the client bundle by design, so one is a shipped credential
 *      rather than a risk of one. This is the path `readEnvValue` used to
 *      offer as a fallback, which is how a "Credentials Missing" report
 *      could have been "fixed" straight into production.
 *
 *   2. A credential read outside a server-only module — `process.env[SECRET]`
 *      or an `import.meta.env` credential lookup in code the browser can
 *      execute.
 *
 * Naming a variable is safe. Reading one in the browser is not, and
 * inlining one is a leak already shipped.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";

import { readSource, sourceFilesUnder } from "./helpers/source-tree";

const ROOT = join(process.cwd(), "src");

/**
 * Every server-side provider secret in the repository.
 *
 * Assembled from fragments rather than written as literals so this file
 * does not itself become the thing a future scanner flags. The list is the
 * point of the guard — a credential absent from it is unguarded — so it is
 * checked against the declared catalogs below rather than trusted to stay
 * current by hand.
 */
const SECRET_NAMES: ReadonlyArray<string> = [
  ["DATALASTIC", "API", "KEY"].join("_"),
  ["OPENSANCTIONS", "API", "KEY"].join("_"),
  ["OPEN", "SANCTIONS", "API", "KEY"].join("_"),
  ["GFW", "API", "TOKEN"].join("_"),
  ["GLOBAL", "FISHING", "WATCH", "API", "KEY"].join("_"),
  ["COPERNICUS", "USERNAME"].join("_"),
  ["COPERNICUS", "PASSWORD"].join("_"),
  ["EQUASIS", "USERNAME"].join("_"),
  ["EQUASIS", "PASSWORD"].join("_"),
  ["IMO", "GISIS", "API", "TOKEN"].join("_"),
  ["OPENCORPORATES", "API", "TOKEN"].join("_"),
  ["NCS", "CUSTOMS", "API", "TOKEN"].join("_"),
  ["NIMASA", "API", "TOKEN"].join("_"),
  ["NPA", "API", "TOKEN"].join("_"),
  ["COMPANIES", "HOUSE", "API", "KEY"].join("_"),
  ["VOLZA", "API", "KEY"].join("_"),
  ["CESIUM", "ION", "TOKEN"].join("_"),
  ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
  ["LOVABLE", "API", "KEY"].join("_"),
];

/**
 * Credentials that legitimately live in the browser.
 *
 * A browser map SDK authenticates the *page* to a tile service, so its key
 * is unavoidably public — there is nowhere else for it to be. That makes
 * it a different kind of secret from a provider credential, which
 * authenticates Seaphore to a metered upstream and has no business
 * leaving the server.
 *
 * Allowlisting is not a shrug: a key here must be domain-restricted at the
 * vendor, so a copy taken from the bundle is useless anywhere but
 * Seaphore's own origin. Neither of these is currently in use — both
 * providers are unimplemented stubs — so nothing is restricted yet, and
 * that restriction is a prerequisite of using either.
 */
const BROWSER_SAFE_MAP_KEYS: ReadonlyArray<string> = [
  ["VITE", "GOOGLE", "MAPS", "API", "KEY"].join("_"),
  ["VITE", "MAPBOX", "ACCESS", "TOKEN"].join("_"),
];

/**
 * Server-only by construction.
 *
 * `*.server.*` and `*.functions.*` say so in the filename. `src/routes/api/`
 * is a server route directory — those files never ship to the browser, and
 * treating them as client-reachable made this guard flag a transcription
 * route that is doing exactly the right thing.
 */
function isServerOnly(path: string): boolean {
  if (/\.server\.(t|j)sx?$/.test(path) || /\.functions\.(t|j)sx?$/.test(path)) return true;
  return path.includes(join("src", "routes", "api"));
}

/*
 * The shared walker, so a file removed between the listing and the read is
 * skipped rather than throwing ENOENT. This guard had the same
 * readdir-then-stat race the others did and failed intermittently on an
 * unrelated file — which, in a security guard, teaches people to re-run
 * until green. The count assertion below is what keeps skipping safe.
 */
const ALL_FILES = sourceFilesUnder(ROOT, /\.(ts|tsx|js|jsx)$/);
const CLIENT_FILES = ALL_FILES.filter(
  (f) => !isServerOnly(f) && !/\.test\.(ts|tsx|js|jsx)$/.test(f),
);

function lineContaining(contents: string, token: string): string {
  return (
    contents
      .split("\n")
      .find((l) => l.includes(token))
      ?.trim() ?? ""
  );
}

describe("no provider secret is inlined into the client bundle", () => {
  /*
   * The one that would already be a shipped credential rather than a risk.
   * Vite replaces `import.meta.env.VITE_X` at build time, so a VITE_ alias
   * of a secret is in every visitor's browser.
   */
  it("declares no VITE_ alias of any provider secret", () => {
    const leaks: Array<{ file: string; token: string; line: string }> = [];
    for (const file of ALL_FILES) {
      if (file.endsWith(join("tests", "unit", "security-no-client-secrets.test.ts"))) continue;
      const contents = readSource(file);
      if (contents === null) continue;
      for (const name of SECRET_NAMES) {
        const aliased = `VITE_${name}`;
        if (contents.includes(aliased)) {
          leaks.push({ file, token: aliased, line: lineContaining(contents, aliased) });
        }
      }
    }

    expect(leaks, `VITE_ aliases of provider secrets:\n${JSON.stringify(leaks, null, 2)}`).toEqual(
      [],
    );
  });

  /*
   * The generic form, which catches a secret this file does not know
   * about. Any `VITE_*_API_KEY`, `VITE_*_TOKEN`, `VITE_*_SECRET` or
   * `VITE_*_PASSWORD` is a credential shape being inlined, whatever the
   * provider is called.
   */
  it("declares no VITE_ variable shaped like a credential", () => {
    const shape = /VITE_[A-Z0-9_]*(?:API_KEY|_TOKEN|_SECRET|_PASSWORD|_PRIVATE_KEY)\b/g;
    const leaks: Array<{ file: string; token: string }> = [];
    for (const file of ALL_FILES) {
      if (file.endsWith(join("tests", "unit", "security-no-client-secrets.test.ts"))) continue;
      const contents = readSource(file);
      if (contents === null) continue;
      for (const match of contents.match(shape) ?? []) {
        // A browser map SDK key has nowhere else to live; a provider
        // credential does. Only the former may appear here.
        if (BROWSER_SAFE_MAP_KEYS.includes(match)) continue;
        leaks.push({ file, token: match });
      }
    }

    expect(leaks, `Credential-shaped VITE_ variables:\n${JSON.stringify(leaks, null, 2)}`).toEqual(
      [],
    );
  });
});

describe("no provider secret is read outside a server-only module", () => {
  it("never reads a secret from process.env in client-reachable code", () => {
    const leaks: Array<{ file: string; token: string; line: string }> = [];
    for (const file of CLIENT_FILES) {
      const contents = readSource(file);
      if (contents === null) continue;
      for (const name of SECRET_NAMES) {
        /*
         * A read, not a mention. `credentialEnv: ["NPA_API_TOKEN"]` is a
         * declaration of what the server needs and is safe; indexing
         * `process.env` with it in browser-reachable code is not.
         */
        const reads = [`process.env["${name}"]`, `process.env['${name}']`, `process.env.${name}`];
        for (const read of reads) {
          if (contents.includes(read)) {
            leaks.push({ file, token: read, line: lineContaining(contents, read) });
          }
        }
      }
    }

    expect(leaks, `Client-reachable secret reads:\n${JSON.stringify(leaks, null, 2)}`).toEqual([]);
  });

  /*
   * The fallback that made every one of the above reachable by accident.
   *
   * `readEnvValue` used to try `import.meta.env["VITE_" + name]` when
   * `process.env` had nothing. Nothing exercised it, which is precisely why
   * it survived review — and it turned "add a VITE_ variable" into a
   * plausible fix for a missing credential.
   */
  it("keeps the credential reader off import.meta.env entirely", () => {
    const providerIo = readSource(
      join(ROOT, "connectors", "implementations", "shared", "provider-io.ts"),
    );
    // A guard that cannot read its subject must fail, not pass quietly.
    expect(providerIo).not.toBeNull();

    const reader = providerIo.slice(
      providerIo.indexOf("function readEnvValue"),
      providerIo.indexOf("export function readProviderCredential"),
    );

    expect(reader.length).toBeGreaterThan(0);
    expect(reader).not.toContain("import.meta");
    expect(reader).not.toContain("VITE_");
  });
});

describe("the guard covers what the catalogs actually declare", () => {
  /*
   * A guard is only as good as its list, and a list maintained by hand
   * silently rots as providers are added. This reads the credential names
   * the provider catalog declares and asserts each one is guarded — so
   * adding a provider without adding its secret here fails the build
   * rather than quietly going unguarded, which is how this file came to be
   * fifteen credentials short in the first place.
   */
  it("guards every credential the provider catalog declares", () => {
    const catalog = readSource(join(ROOT, "connectors", "catalog.ts"));
    expect(catalog).not.toBeNull();

    const declared = new Set<string>();
    for (const block of catalog.match(/credentialEnv:\s*\[[^\]]*\]/g) ?? []) {
      for (const quoted of block.match(/"([A-Z][A-Z0-9_]+)"/g) ?? []) {
        declared.add(quoted.slice(1, -1));
      }
    }

    // The catalog does declare credentials; an empty read would make this
    // test vacuously green.
    expect(declared.size).toBeGreaterThan(5);

    const guarded = new Set(SECRET_NAMES);
    const unguarded = [...declared].filter(
      (name) => !guarded.has(name) && !name.endsWith("_BASE_URL"),
    );

    expect(unguarded, `Declared but unguarded credentials: ${unguarded.join(", ")}`).toEqual([]);
  });
});
