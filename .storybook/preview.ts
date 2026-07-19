import type { Preview } from "@storybook/react";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: {
      default: "surface",
      values: [
        { name: "surface", value: "#F7F8FA" },
        { name: "navy",    value: "#0B1F3A" },
      ],
    },
  },
};

export default preview;
