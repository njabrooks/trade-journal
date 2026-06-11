import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Money-math tests are pure and must not touch the database.
    env: {
      DATABASE_URL_POOLER: '',
      DATABASE_URL_DIRECT: '',
    },
  },
});
