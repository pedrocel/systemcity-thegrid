// Uma conta nova por teste: cadastra pela API (a tela de cadastro tem o próprio teste) e deixa o cookie no navegador.
export async function novaConta(page, nome = 'Teste') {
  const id = Math.random().toString(36).slice(2, 8), r = await page.request.post('/api/cadastro', { data: { email: `${id}@e2e.dev`, nome, senha: 'senha-e2e-123', nick: `e2e_${id}` } });
  if (!r.ok()) throw new Error(`cadastro falhou: ${r.status()}`); return { ...(await r.json()), senha: 'senha-e2e-123' };
}
// erros de JavaScript na página (os de rede de terceiros, como fontes, não contam)
export function vigiarErros(page) { const erros = []; page.on('pageerror', e => erros.push(e.message)); return erros; }
