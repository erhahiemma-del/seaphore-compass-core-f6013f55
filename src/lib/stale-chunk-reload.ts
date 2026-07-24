/**
 * After a redeploy, previously-loaded HTML references chunk hashes that no
 * longer exist on the server. When TanStack Router tries to lazy-load a
 * route, Vite throws `Failed to fetch dynamically imported module`. The
 * only recovery is a hard reload so the client picks up the new HTML +
 * chunk manifest.
 *
 * We reload at most once per session to avoid infinite loops when the
 * failure has some other cause (network offline, adblocker, etc.).
 */
const RELOAD_FLAG = "__seaphore_stale_chunk_reloaded";

function isChunkLoadError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (err as { message?: string })?.message ?? "";
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

function tryReload(err: unknown) {
  if (!isChunkLoadError(err)) return;
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    /* sessionStorage blocked — still attempt reload once */
  }
  window.location.reload();
}

export function installStaleChunkReload() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => tryReload(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => tryReload(event.reason));
}
