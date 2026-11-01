#!/usr/bin/env node
// Gera o catálogo de documentos de uma cidade a partir de pastas de markdown (specs, ADRs, READMEs dos seus repositórios).
//
// Uso:  node scripts/gerar-catalogo.mjs cities/<cidade>/fontes.json
//
// fontes.json diz de onde ler e em que bairro cada documento entra:
//   {
//     "repos": [ { "repo": "loja-api", "pasta": "../loja-api" } ],
//     "bairros": { "pedidos": ["loja-api/docs/pedidos/**"], "pagamentos": ["loja-api/docs/pagamentos/**"] }
//   }
// Saída, na pasta da cidade: catalogo.js (lista e estado de cada documento) e textos-<bairro>.js (o markdown, baixado só quando o bairro é aberto).
// Na cidade, ligue com  catalogo: 'catalogo.js'.
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join, relative, basename, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const arqFontes = resolve(process.argv[2] || ''), saida = dirname(arqFontes);
if (!process.argv[2]) { console.error('uso: node scripts/gerar-catalogo.mjs cities/<cidade>/fontes.json'); process.exit(1); }
const fontes = JSON.parse(await readFile(arqFontes, 'utf8'));

async function listar(pasta) { const out = [];
  for (const e of await readdir(pasta, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = join(pasta, e.name); if (e.isDirectory()) out.push(...await listar(p)); else if (e.name.toLowerCase().endsWith('.md')) out.push(p); }
  return out; }
// glob simples: ** = qualquer coisa, * = qualquer coisa sem barra
const casa = (padrao, caminho) => new RegExp('^' + padrao.split('**').map(t => t.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$').test(caminho);
const git = (pasta, ...a) => { try { return execFileSync('git', ['-C', pasta, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

const STATUS_OK = /aprovad|implementad|aceit|conclu|done|accepted|approved/i, STATUS_ANDA = /revis|rascunho|draft|andamento|proposed|propost/i;
const repos = [], bairros = {}, textos = {};
for (const r of fontes.repos || []) {
  const pasta = resolve(saida, r.pasta); repos.push({ repo: r.repo, branch: git(pasta, 'rev-parse', '--abbrev-ref', 'HEAD') || r.branch || '?', commit: git(pasta, 'rev-parse', '--short', 'HEAD') || '?' });
  for (const arq of await listar(pasta)) {
    const rel = relative(pasta, arq).split(sep).join('/'), chave = `${r.repo}/${rel}`;
    const bairro = Object.entries(fontes.bairros || {}).find(([, pads]) => pads.some(p => casa(p, chave)))?.[0]; if (!bairro) continue;
    const md = await readFile(arq, 'utf8'), titulo = (md.match(/^#\s+(.+)$/m) || [])[1]?.trim() || basename(rel, '.md');
    const status = (md.match(/^\**status\**\s*[:：]\s*\**([^\n*]+)/im) || [])[1]?.trim() || null;
    const adr = /(^|\/)adrs?(\/|-)|^adr[-_ ]?\d/i.test(rel) || /^adr[-_ ]?\d/i.test(basename(rel));
    const rn = (md.match(/\bRN[-_ ]?\d+/g) || []).length, slug = basename(rel, '.md').toLowerCase();
    (bairros[bairro] ??= []).push({ id: `${bairro}-${slug}-${(bairros[bairro] || []).length}`, bairro, natureza: adr ? 'adr' : 'spec', slug, titulo, status,
      classe: status ? (STATUS_OK.test(status) ? 'ok' : STATUS_ANDA.test(status) ? 'andamento' : 'sem') : 'sem', rn, repos: [r.repo],
      docs: [{ chave, repo: r.repo, caminho: chave, tipo: adr ? 'ADR' : 'Documento', titulo, status, rn, ca: 0, bytes: (await stat(arq)).size }] });
    (textos[bairro] ??= {})[chave] = md;
  }
}

await writeFile(join(saida, 'catalogo.js'), `window.CIDADE_SPECS = ${JSON.stringify({ geradoEm: new Date().toISOString(), repos, bairros })};\n`);
for (const [b, t] of Object.entries(textos)) await writeFile(join(saida, `textos-${b}.js`), `(window.CIDADE_TEXTOS = window.CIDADE_TEXTOS || {})[${JSON.stringify(b)}] = ${JSON.stringify(t)};\n`);
const total = Object.values(bairros).reduce((n, l) => n + l.length, 0);
console.log(`${total} documentos em ${Object.keys(bairros).length} bairros → ${relative(process.cwd(), join(saida, 'catalogo.js'))}`);
