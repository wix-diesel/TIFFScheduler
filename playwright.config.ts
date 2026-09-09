import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/TIFFScheduler/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 13 Mini'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/TIFFScheduler/',
    reuseExistingServer: false,
  },
});
