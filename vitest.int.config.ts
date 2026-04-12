import { defineConfig, mergeConfig } from 'vitest/config';

import { ensureIntegrationTestEnv } from './src/test/integration/env.js';
import baseConfig from './vitest.config.js';

ensureIntegrationTestEnv();

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
