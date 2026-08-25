import { supabase } from "@/integrations/supabase/client";
import { hasBackendBrowserConfig } from "@/lib/backend-browser-config";

/**
 * The generated client is lazy and can throw on its first property access
 * when a browser bundle was built without Lovable Cloud bindings. Keep that
 * synchronous failure inside a recovery boundary so React effects cannot
 * unmount the application.
 */
export function getBackendAuthSafely() {
  if (!hasBackendBrowserConfig()) return null;

  try {
    return supabase.auth;
  } catch (error) {
    console.error("[Seaphore auth] Backend client unavailable:", error);
    return null;
  }
}
