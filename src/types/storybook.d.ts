/**
 * Local Storybook 8 type shim.
 *
 * Storybook is scaffolded in .storybook/ but the CLI is not yet
 * installed as an npm dependency. This shim keeps stories authoring
 * type-safe under `tsgo` without pulling the full toolchain.
 */
declare module "@storybook/react" {
  export interface Meta<TComponent = unknown> {
    title?: string;
    component?: TComponent;
    parameters?: Record<string, unknown>;
    argTypes?: Record<string, unknown>;
    args?: Record<string, unknown>;
    tags?: string[];
  }
  export interface StoryObj<TComponent = unknown> {
    args?: TComponent extends (props: infer P) => unknown
      ? Partial<P>
      : Record<string, unknown>;
    render?: (args: Record<string, unknown>) => JSX.Element;
    parameters?: Record<string, unknown>;
  }
}
