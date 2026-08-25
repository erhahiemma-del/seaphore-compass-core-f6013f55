/**
 * Browser-safe health check for the generated Lovable Cloud client bindings.
 * Values are intentionally never returned or logged.
 */
export function hasBackendBrowserConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL?.trim() &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}
