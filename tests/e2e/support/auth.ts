/**
 * Restore the sandbox-managed Supabase session onto a Playwright page so
 * tests can reach `_authenticated/*` routes without going through the
 * login form. Safe no-op when auth is not injected (tests will skip).
 */
import type { Page, BrowserContext } from "@playwright/test";

export function isAuthInjected(): boolean {
  return process.env.LOVABLE_BROWSER_AUTH_STATUS === "injected";
}

export async function restoreSupabaseSession(context: BrowserContext, page: Page) {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

  if (cookiesJson) {
    const cookies = JSON.parse(cookiesJson).map((c: Record<string, unknown>) => ({
      ...c,
      url: "http://localhost:8080",
    }));
    await context.addCookies(cookies);
  }

  await page.goto("http://localhost:8080/");
  if (storageKey && sessionJson) {
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key as string, value as string),
      [storageKey, sessionJson],
    );
  }
}
