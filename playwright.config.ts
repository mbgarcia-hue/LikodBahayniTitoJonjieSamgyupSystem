import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3107', trace: 'retain-on-failure', launchOptions: { executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' } },
  webServer: {
    command: 'node server/index.js',
    url: 'http://127.0.0.1:3107/api/health',
    reuseExistingServer: false,
    env: { PORT: '3107', DATABASE_PATH: path.resolve(`tests/.tmp/browser-${randomUUID()}.sqlite`), CASHIER_PASSWORD: 'Cashier@123', KITCHEN_PASSWORD: 'Kitchen@123', OWNER_PASSWORD: 'Owner@123' },
  },
});
