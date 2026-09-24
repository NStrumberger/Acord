import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any host or subpath
  // (GitHub Pages project sites included) without reconfiguration.
  base: './',
  build: { target: 'es2022' },
});
