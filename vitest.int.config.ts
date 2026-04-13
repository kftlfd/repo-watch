import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['src/**/*.int.test.ts'],
      globalSetup: ['./src/test/integration/global-setup.ts'],
      setupFiles: ['./src/test/integration/setup.ts'],
      fileParallelism: false,
    },
  }),
);
