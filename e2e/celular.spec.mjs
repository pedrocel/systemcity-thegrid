import { test, expect } from '@playwright/test';
import { novaConta, vigiarErros } from './ajuda.mjs';

const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('no celular a landing e a cidade cabem na tela', async ({ page }) => {
  const erros = vigiarErros(page); await page.goto('/'); expect(await semRolagemLateral(page)).toBe(true);
  await novaConta(page); await page.goto('/cidade.html'); await expect(page.locator('canvas').first()).toBeVisible();
  expect(await page.evaluate(() => innerWidth)).toBeLessThan(500); expect(await semRolagemLateral(page)).toBe(true);
  await expect(page.locator('.barra')).toBeVisible();
  expect(erros).toEqual([]);
});
