// Auditoria com repositório e Claude falsos: confere os quatro focos, o filtro de achados inventados, o bairro e a ida para o agente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { auditorias, lotes, FOCOS } from '../auditoria.mjs';

test('lotes numeram as linhas e respeitam o tamanho', () => {
  const ls = lotes([{ caminho: 'a.js', texto: 'x\ny' }, { caminho: 'b.js', texto: 'z'.repeat(50) }], 60);
  assert.equal(ls.length, 2); assert.match(ls[0], /=== a\.js ===\n1\| x\n2\| y/);
});

test('auditoria: quatro focos, achados conferidos e corrigir manda ao agente', async () => {
  const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE usuarios (id INTEGER PRIMARY KEY, github_token TEXT); INSERT INTO usuarios VALUES (1, NULL);');
  const cidade = { slug: 'loja', dono: 1, fonte: 'github:acme/loja', definicao: { bairros: [{ id: 'pagamentos', pastas: ['src/pagamentos'] }] } };
  const cidades = { ver: (s) => { if (s !== 'loja') throw new Error('não'); return cidade; } }, pedidosAgente = [], focos = [];
  const ler = async (repo, token, op) => { assert.equal(repo, 'github:acme/loja'); assert.equal(op.codigo, true); return { repo, arquivos: [{ caminho: 'src/pagamentos/cobrar.js', texto: 'db.query("SELECT * FROM x WHERE id=" + id)' }] }; };
  const perguntar = async (pedido, { sistema }) => { const foco = Object.keys(FOCOS).find(f => sistema.includes(FOCOS[f].o)); focos.push(foco); assert.match(pedido, /1\| db\.query/);
    return foco === 'seguranca' ? { achados: [{ arquivo: 'src/pagamentos/cobrar.js', linha: 1, severidade: 'critica', titulo: 'SQL injection no id', explicacao: 'concatena', sugestao: 'use parâmetros' }, { arquivo: 'inventado.js', linha: 3, titulo: 'fantasma' }] } : { achados: [] }; };
  const A = auditorias(db, { cidades, conexoes: { cred: () => null }, agentes: { criar: async (u, x) => { pedidosAgente.push(x); return { id: 9 }; } }, ler, perguntar });
  assert.equal(A.iniciar('loja', 1).estado, 'rodando'); await A.aguardar();
  const r = A.ver('loja', 1); assert.equal(r.estado, 'pronta'); assert.deepEqual(focos.sort(), Object.keys(FOCOS).sort());
  assert.equal(r.achados.length, 1, 'o achado em arquivo que não existe é descartado');
  assert.equal(r.achados[0].bairro, 'pagamentos'); assert.equal(r.achados[0].severidade, 'critica');
  assert.deepEqual(await A.corrigir('loja', 1, r.id, 0), { id: 9 });
  assert.match(pedidosAgente[0].pedido, /SQL injection/); assert.equal(pedidosAgente[0].foco, 'pagamentos');
});

test('auditoria só para cidade do GitHub', () => {
  const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE usuarios (id INTEGER PRIMARY KEY, github_token TEXT);');
  const A = auditorias(db, { cidades: { ver: () => ({ fonte: 'modelo:saas', definicao: {} }) }, agentes: {} });
  assert.throws(() => A.iniciar('x', 1), /repositório/);
});
