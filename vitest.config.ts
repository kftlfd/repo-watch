import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({ path: '.env.test' });

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: { provider: 'v8' },
  },
});
