// SystemCity bridge: junta fontes de dados (ferramentas de servidores MCP, APIs HTTP e webhooks) e entrega tudo à cidade
// como eventos num stream SSE em GET /eventos. Na cidade: conectores: [{ tipo: 'sse', url: 'http://localhost:4300/eventos' }].
//
// Uso:  node servidor.mjs [config.json]      (padrão: config.json; veja config.exemplo.json)
//
// Evento = { bairro, tipo? }. Cada coleta tem um `mapa`: o caminho de um módulo .mjs cuja função padrão recebe a resposta
// e devolve uma lista de eventos. Sem mapa, a resposta já precisa ser um evento ou uma lista deles.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const arquivo = resolve(process.argv[2] || 'config.json'), pasta = dirname(arquivo);
const cfg = JSON.parse(await readFile(arquivo, 'utf8'));
const porta = cfg.porta || 4300, ouvintes = new Set();

const lista = (x) => (Array.isArray(x) ? x : x ? [x] : []);
function emitir(eventos) {
  for (const ev of lista(eventos)) { if (!ev || !ev.bairro) continue; const linha = `data: ${JSON.stringify(ev)}\n\n`; for (const res of ouvintes) res.write(linha); }
}
async function carregarMapa(caminho) { if (!caminho) return (x) => x; return (await import(pathToFileURL(resolve(pasta, caminho)).href)).default; }

// ---------- servidores MCP ----------
const clientes = {};
for (const [nome, s] of Object.entries(cfg.mcp || {})) {
  const transporte = s.url ? new StreamableHTTPClientTransport(new URL(s.url), { requestInit: { headers: s.headers || {} } })
    : new StdioClientTransport({ command: s.command, args: s.args || [], env: { ...process.env, ...(s.env || {}) }, cwd: s.cwd ? resolve(pasta, s.cwd) : pasta });
  const cliente = new Client({ name: 'systemcity-bridge', version: '0.1.0' });
  try { await cliente.connect(transporte); clientes[nome] = cliente;
    const { tools } = await cliente.listTools(); console.log(`MCP "${nome}" conectado: ${tools.map(t => t.name).join(', ') || 'sem ferramentas'}`); }
  catch (e) { console.error(`MCP "${nome}" não conectou: ${e.message}`); }
}

// resposta de ferramenta MCP: usa structuredContent se houver; senão tenta ler o texto como JSON
function conteudo(r) { if (r.structuredContent) return r.structuredContent;
  const txt = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'); try { return JSON.parse(txt); } catch { return txt; } }

// ---------- coletas periódicas ----------
for (const c of cfg.coletas || []) {
  const mapa = await carregarMapa(c.mapa), cada = c.cada || 5000;
  const rodar = async () => {
    try {
      let dado;
      if (c.mcp) { const cli = clientes[c.mcp]; if (!cli) return; dado = conteudo(await cli.callTool({ name: c.ferramenta, arguments: c.argumentos || {} })); }
      else if (c.url) { const r = await fetch(c.url, { headers: c.headers || {} }); dado = await r.json(); }
      emitir(await mapa(dado));
    } catch (e) { console.error(`coleta ${c.mcp ? c.mcp + '/' + c.ferramenta : c.url} falhou: ${e.message}`); }
  };
  rodar(); setInterval(rodar, cada);
}

// ---------- HTTP: stream para a cidade e webhook de entrada ----------
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', cfg.origem || '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'content-type'); res.writeHead(204).end(); return; }
  if (req.method === 'GET' && req.url === '/eventos') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }); res.write(': conectado\n\n');
    ouvintes.add(res); req.on('close', () => ouvintes.delete(res)); return;
  }
  if (req.method === 'POST' && req.url === '/evento') {   // webhook: qualquer sistema pode empurrar eventos para a cidade
    let corpo = ''; for await (const p of req) corpo += p;
    try { emitir(JSON.parse(corpo)); res.writeHead(204).end(); } catch { res.writeHead(400).end('JSON inválido'); }
    return;
  }
  if (req.url === '/saude') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, ouvintes: ouvintes.size, mcp: Object.keys(clientes) })); return; }
  res.writeHead(404).end();
}).listen(porta, () => console.log(`SystemCity bridge em http://localhost:${porta} — stream em /eventos, webhook em POST /evento`));
