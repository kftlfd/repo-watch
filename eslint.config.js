// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(eslint.configs.recommended, tseslint.configs.strictTypeChecked, {
  languageOptions: {
    parserOptions: {
      projectService: true,
    },
  },
  rules: {
    '@typescript-eslint/no-unnecessary-condition': [
      'error',
      { allowConstantLoopConditions: 'only-allowed-literals' },
    ],
  },
});
