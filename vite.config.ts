import { defineConfig } from 'vite';

export default defineConfig({
  base: '/TIFFScheduler/',
  build: {
    // Vite collects licenses for the dependencies that are bundled into the app.
    // Keep this as JSON so it can also be presented from the application UI.
    license: { fileName: 'licenses.json' },
  },
  // The root tsconfig covers only the scheduler; explicitly use React's JSX runtime.
  esbuild: { jsx: 'automatic' },
});
