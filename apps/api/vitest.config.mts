import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC, not esbuild, so Nest's decorator metadata (constructor injection) is emitted.
// ES module output: Vitest cannot be loaded through require().
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
