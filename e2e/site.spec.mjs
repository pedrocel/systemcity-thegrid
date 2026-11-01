import { test, expect } from '@playwright/test';
import { novaConta, vigiarErros } from './ajuda.mjs';

test('landing abre e leva ao cadastro', async ({ page }) => {
  const erros = vigiarErros(page); await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.getByRole('link', { name: 'Criar conta' }).first().click(); await expect(page).toHaveURL(/entrar\.html/);
  expect(erros).toEqual([]);
});

test('cadastro pela tela, equipe e convite pelo nick', async ({ page, request }) => {
  const amiga = await novaConta({ request }, 'Amiga');   // outra sessão, fora do navegador
  const id = Math.random().toString(36).slice(2, 8);
  await page.goto('/entrar.html'); await page.locator('#aba-criar').click(); const f = page.locator('#f-criar');
  await f.locator('[name=nome]').fill('Pessoa Teste'); await f.locator('[name=nick]').fill(`p_${id}`); await f.locator('[name=email]').fill(`${id}@e2e.dev`); await f.locator('[name=senha]').fill('senha-e2e-123');
  await f.getByRole('button', { name: 'Criar conta' }).click(); await page.waitForURL(u => !u.pathname.endsWith('entrar.html'));
  await page.goto('/equipes.html'); await page.locator('#f-nova [name=nome]').fill('Plataforma'); await page.locator('#f-nova').getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Pessoas (1)' })).toBeVisible();
  await page.locator('#f-add [name=nick]').fill(amiga.nick); await page.locator('#f-add').getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByRole('heading', { name: 'Pessoas (2)' })).toBeVisible();
});

test('a cidade desenha e abre o painel de encontros', async ({ page }) => {
  const erros = vigiarErros(page); await novaConta(page); await page.goto('/cidade.html');
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window.CID && window.CID.PREDIOS || []).length)).toBeGreaterThan(5);
  await page.locator('#b-encontros').click(); await expect(page.locator('#encontros')).toBeVisible();
  expect(erros).toEqual([]);
});

test('páginas abertas não quebram', async ({ page }) => {
  const erros = vigiarErros(page);
  for (const p of ['/entrar.html', '/redefinir.html']) { await page.goto(p); await expect(page.locator('body')).toBeVisible(); }
  expect(erros).toEqual([]);
});
