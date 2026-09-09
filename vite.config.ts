import { defineConfig } from 'vite';

export default defineConfig({
  base: '/TIFFScheduler/',
  // The root tsconfig covers only the scheduler; explicitly use React's JSX runtime.
  esbuild: { jsx: 'automatic' },
});
