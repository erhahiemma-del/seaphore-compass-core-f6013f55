/**
 * Central export for mock fixtures used in tests and Storybook.
 * Real data always comes from Supabase repositories — mocks are for
 * offline UI development and deterministic tests only. Never import
 * mocks from route/loader or component code.
 */
export * from "./vessels";
export * from "./briefings";
export * from "./officers";
