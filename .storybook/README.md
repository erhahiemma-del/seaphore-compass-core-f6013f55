# Storybook

Storybook is configured but its dependencies are not installed by default to
keep sandbox cold-starts fast.

## Install

```bash
bun add -d storybook @storybook/react-vite @storybook/react @storybook/addon-essentials @storybook/addon-a11y
```

## Run

```bash
bun run storybook          # dev server on :6006
bun run build-storybook    # static build in storybook-static/
```

Stories live next to their components as `Component.stories.tsx`.
Tailwind v4 and the design-token CSS from `src/styles.css` are loaded via
`preview.ts` so every story renders with real theme values.
