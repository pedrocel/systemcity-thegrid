// Sobe o servidor numa porta própria, com um banco descartável, e roda os testes no Chromium (desktop e celular).
import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORTA = 4499;
export default defineConfig({
  testDir: '.', timeout: 60e3, retries: process.env.CI ? 1 : 0, reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORTA}`, trace: 'retain-on-failure', ...(process.env.CI ? {} : { channel: 'chrome' }) },   // na máquina, o Chrome instalado
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...(process.env.CI ? {} : { channel: 'chrome' }) }, testIgnore: /celular/ },
    { name: 'celular', use: { ...devices['Pixel 7'], ...(process.env.CI ? {} : { channel: 'chrome' }) }, testMatch: /celular/ },
  ],
  webServer: { command: 'node ../servidor/index.mjs', url: `http://127.0.0.1:${PORTA}/saude`, reuseExistingServer: false, timeout: 30e3,
    env: { PORTA: String(PORTA), HTTPS: '0', BANCO: join(tmpdir(), `systemcity-e2e-${Date.now()}.db`), CLAUDE_CMD: '' } },
});
