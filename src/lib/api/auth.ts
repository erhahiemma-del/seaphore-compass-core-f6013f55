/**
 * JWT auth middleware for HTTP route handlers.
 * Verifies the Supabase-issued Bearer token against Auth server, returns the
 * authenticated user's id + role claim. Fails closed with 401 on any error.
 */
import { createClient } from "@supabase/supabase-js";
import { Errors } from "./errors";

export interface AuthContext {
  userId: string;
  email: string | null;
  role: string;
  token: string;
}

/**
 * Same trick as our server clients: opaque sb_ publishable keys aren't JWTs,
 * so strip the auto-added Bearer to keep PostgREST/Auth happy.
 */
function buildVerifier() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    throw Errors.unauthorized("Missing Authorization: Bearer <token> header");
  }
  const token = header.slice(7).trim();
  if (!token) throw Errors.unauthorized("Empty bearer token");

  const client = buildVerifier();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Errors.unauthorized("Invalid or expired token");

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    role: (data.user.app_metadata?.role as string) ?? "officer",
    token,
  };
}
