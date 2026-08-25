import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp"
  ],
  "framework": {
    "name": "@storybook/react-vite",
    "options": {}
  },
  "viteFinal": async (viteConfig) => {
    viteConfig.server = {
      ...viteConfig.server,
      hmr: { clientPort: 443 },
    };
    return viteConfig;
  },
};

export default config;
