// Mede a busca do "Pergunte ao código" contra um repositório local: recall@k e MRR por modo. Um acerto é achar um dos arquivos esperados.
// Uso: node avaliacao/avaliar.mjs ../caminho/do/repo   (perguntas.json foi escrito antes de ver qualquer resultado; não ajuste perguntas para melhorar a nota)
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fatiar, buscar, criarBM25, embutirLocal } from '../rag.mjs';

const raiz = resolve(process.argv[2] || '..'), perguntas = JSON.parse(readFileSync(new URL('./perguntas.json', import.meta.url)));
const ACEITA = /\.(mjs|js|md|html|yml|sh|css)$/, FORA = /(^|\/)(node_modules|vendor|avaliacao)\/|\.min\.js$/;
const arquivos = execSync('git ls-files', { cwd: raiz, encoding: 'utf8' }).split('\n').filter(a => ACEITA.test(a) && !FORA.test(a));
const trechos = arquivos.flatMap(a => fatiar(a, readFileSync(join(raiz, a), 'utf8'))), emb = await embutirLocal();
let t0 = Date.now();
for (let i = 0; i < trechos.length; i += 16) { const l = trechos.slice(i, i + 16), v = await emb(l.map(t => `${t.caminho}\n${t.texto}`), 'trecho'); l.forEach((t, k) => { t.vetor = v[k]; }); }
const msTrecho = (Date.now() - t0) / trechos.length, bm25 = criarBM25(trechos.map(t => `${t.caminho}\n${t.texto}`)), saida = {};
for (const modo of ['bm25', 'vetor', 'hibrida']) { const r = { 'recall@1': 0, 'recall@3': 0, 'recall@5': 0, 'recall@8': 0, mrr: 0, erros: [] }; t0 = Date.now();
  for (const p of perguntas) { const [vc] = await emb([p.q], 'consulta'), ordem = buscar(trechos, p.q, { bm25, vetorConsulta: vc, modo }).map(i => trechos[i].caminho), pos = ordem.findIndex(c => p.r.includes(c));
    for (const k of [1, 3, 5, 8]) if (pos >= 0 && pos < k) r[`recall@${k}`]++; if (pos >= 0) r.mrr += 1 / (pos + 1); if (pos < 0 || pos >= 8) r.erros.push(p.q); }
  for (const k of ['recall@1', 'recall@3', 'recall@5', 'recall@8', 'mrr']) r[k] = +(r[k] / perguntas.length).toFixed(3); r.msConsulta = Math.round((Date.now() - t0) / perguntas.length); saida[modo] = r; }
const relatorio = { perguntas: perguntas.length, arquivos: arquivos.length, trechos: trechos.length, msPorTrecho: +msTrecho.toFixed(1), modos: saida };
writeFileSync(new URL('./resultados.json', import.meta.url), JSON.stringify(relatorio, null, 2) + '\n'); console.log(JSON.stringify(relatorio, null, 1));
