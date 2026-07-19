/**
 * Typed accessor for the Seaphore design tokens.
 * Import the JSON; never re-declare token values here.
 * The JSON is the single source of truth (see src/design-tokens/tokens.json).
 */
import tokens from "./tokens.json";

export const designTokens = tokens;
export type DesignTokens = typeof tokens;

export const color = tokens.color;
export const typography = tokens.typography;
export const spacing = tokens.spacing;
export const radius = tokens.radius;
export const shadow = tokens.shadow;
