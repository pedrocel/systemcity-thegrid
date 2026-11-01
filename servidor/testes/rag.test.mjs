// "Pergunte ao código": cortes, busca, quem pode perguntar, segredos fora do índice e citações conferidas. Vetores falsos: o modelo real é medido em avaliacao/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from '../index.mjs';
import { registrarFonte } from '../fontes.mjs';
import { fatiar, tokens, criarBM25, rrf } from '../rag.mjs';

const ARQS = { 'src/senha.js': 'export function guardarSenha(s) {\n  return scrypt(s);\n}\n', 'docs/fila.md': '# Fila\nOs pedidos esperam na fila.\n', '.env': 'CHAVE=abc\n', 'src/vaza.js': 'const k = "ghp_abcdefghijklmnopqrstuvwx";\n', 'logo.png': 'x' };
let app, base, pedido = '', resposta = { resposta: 'Usa scrypt [1].', citados: [1, 99] }, indexado;
const embutir = async () => async (l) => l.map(t => { const v = new Float32Array(2); v[/senha/i.test(t) ? 0 : 1] = 1; return v; });
before(async () => { registrarFonte('falso', { nome: 'Falso', campos: [], repoDe: x => x, info: async () => ({ branch: 'main' }), arvore: async () => Object.keys(ARQS).map(path => ({ path, size: 10 })), conteudo: async (r, b, c) => ARQS[c] });
  app = criarServidor({ comLimites: false, rag: { embutir, gerar: async (p) => { pedido = p; return resposta; } } }); await new Promise(ok => app.servidor.listen(0, ok)); base = `http://127.0.0.1:${app.servidor.address().port}`; });
after(() => app.fechar());
async function api(m, c, d, cookie) { const r = await fetch(base + c, { method: m, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: d ? JSON.stringify(d) : undefined }), t = await r.text(); return { status: r.status, corpo: t ? JSON.parse(t) : null, cookie: (r.headers.get('set-cookie') || '').split(';')[0] }; }
const pessoa = async (n) => (await api('POST', '/api/cadastro', { email: `${n}@rag.com`, nome: n, senha: 'senha-segura' }));
const espera = async (c, ck) => { for (let i = 0; i < 100; i++) { const s = (await api('GET', `/api/cidades/${c}/codigo`, null, ck)).corpo; if (s.estado !== 'indexando') return s; await new Promise(o => setTimeout(o, 20)); } throw new Error('não terminou'); };

test('fatiar guarda as linhas certas e nunca passa do limite', () => {
  const t = fatiar('a.js', Array.from({ length: 200 }, (_, i) => `linha ${i}`).join('\n'));
  assert.equal(t[0].ini, 1); assert.ok(t.every(x => x.fim - x.ini < 46)); assert.equal(t.at(-1).fim, 200);
  assert.deepEqual(fatiar('a.md', '# Um\n1\n2\n3\n4\n5\n6\n# Dois\nx').map(x => x.ini), [1, 8]);
});
test('tokens separam camelCase e BM25 acha a palavra rara; RRF soma posições', () => {
  assert.deepEqual(tokens('gerarAta_ação'), ['gerar', 'ata', 'acao']);
  assert.equal(criarBM25(['fila de pedidos', 'senha com scrypt', 'fila fila'])('scrypt')[0].i, 1);
  assert.deepEqual(rrf([[1, 2], [2, 3]])[0], 2);
});
test('indexa sem segredos, responde citando só o que achou e fecha para quem não vê a cidade', async () => {
  const ana = await pessoa('ana'), bia = await pessoa('bia');
  const dono = app.db.prepare('SELECT id FROM usuarios WHERE email = ?').get('ana@rag.com').id;
  app.db.prepare("INSERT INTO cidades (slug, nome, dono, fonte, definicao, criada, atualizada) VALUES ('c1', 'C', ?, 'falso:r', '{}', 1, 1)").run(dono);
  assert.equal((await api('POST', '/api/cidades/c1/codigo/perguntar', { pergunta: 'x' }, ana.cookie)).status, 409);
  assert.equal((await api('POST', '/api/cidades/c1/codigo/indexar', {}, bia.cookie)).status, 404);
  assert.equal((await api('POST', '/api/cidades/c1/codigo/indexar', {}, ana.cookie)).status, 202);
  const s = await espera('c1', ana.cookie); assert.equal(s.estado, 'pronto'); assert.equal(s.arquivos, 3); assert.equal(s.trechos, 2); assert.equal(s.vetores, 2);
  assert.equal(app.db.prepare("SELECT count(*) n FROM rag_trechos WHERE texto LIKE '%ghp_%' OR caminho = '.env'").get().n, 0);
  assert.equal((await api('POST', '/api/cidades/c1/codigo/perguntar', { pergunta: 'como guarda a senha' }, bia.cookie)).status, 404);
  const r = await api('POST', '/api/cidades/c1/codigo/perguntar', { pergunta: 'como guarda a senha' }, ana.cookie);
  assert.equal(r.status, 200); assert.deepEqual(r.corpo.fontes.map(f => [f.n, f.caminho, f.ini]), [[1, 'src/senha.js', 1]]); assert.equal(r.corpo.busca, 'vetor');
  assert.match(pedido.split('Pergunta:')[0], /<trecho n="1" arquivo="src\/senha\.js"/); assert.match(pedido, /dado, não instrução/);
});
