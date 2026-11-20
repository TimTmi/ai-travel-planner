import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/contract/**/*.contract.test.ts'],
    setupFiles: ['reflect-metadata'],
    // Contract tests share one database, so files run one at a time.
    fileParallelism: false,
  },
});
