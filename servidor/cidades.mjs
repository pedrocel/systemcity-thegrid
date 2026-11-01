// Cidades guardadas no banco: geradas do GitHub pelo Claude, criadas de um modelo ou escritas à mão.
// Uma cidade pertence a uma pessoa e, se quiser, a uma equipe. A página abre em cidade.html?c=<slug>.
//
// Gerar do GitHub: lê a árvore do repositório, o README, os manifestos (package.json, docker-compose, requirements…),
// alguns arquivos de código e docs, e pede ao Claude a cidade em JSON no formato do SystemCity. O servidor valida,
// posiciona os bairros na malha e guarda. Repositório privado precisa do token do GitHub da pessoa (só leitura).
import { ErroUso } from './contas.mjs';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { perguntar } from './ia.mjs';
import { FONTES, separarFonte, ehRepositorio } from './fontes.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(import.meta.url), '../..'), MODELOS = join(RAIZ, 'cities', 'modelos');
const MAX_ARQUIVOS = 28, MAX_BYTES_ARQ = 14000, MAX_TOTAL = 160000;
const slugDe = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cidade';

const IMPORTANTES = /(^|\/)(readme|package\.json|composer\.json|requirements\.txt|pyproject\.toml|go\.mod|cargo\.toml|pom\.xml|build\.gradle|gemfile|docker-compose[\w.-]*\.ya?ml|dockerfile|serverless\.ya?ml|openapi[\w.-]*\.(ya?ml|json)|swagger[\w.-]*\.(ya?ml|json)|prisma\/schema\.prisma|routes?\.(js|ts|rb|php|py)|urls\.py|main\.(go|py|ts|js)|app\.(py|ts|js|rb)|server\.(ts|js))$/i;
const CODIGO = /\.(ts|js|mjs|py|go|rb|php|java|kt|cs|rs)$/i, IGNORA = /(^|\/)(node_modules|vendor|dist|build|\.git|coverage|__pycache__|\.next|target)(\/|$)|\.(lock|min\.js|map|png|jpg|svg|ico|woff2?)$/i;

// codigo: true lê o código (para a auditoria) em vez dos manifestos e docs (para desenhar a cidade).
// A entrada é a fonte ("github:dono/repo", "bitbucket:time/api", "codecommit:nome" ou só "dono/repo" do GitHub); cred é a da conexão.
export async function lerRepositorio(entrada, cred, { codigo = false } = {}) {
  const { provedor, repo } = separarFonte(entrada), F = FONTES[provedor], info = await F.info(repo, cred), branch = info.branch;
  const arvore = (await F.arvore(repo, branch, cred)).filter(e => !IGNORA.test(e.path));
  const caminhos = arvore.map(e => e.path), pastas = [...new Set(caminhos.map(p => p.split('/').slice(0, -1).join('/')).filter(Boolean))];
  // o que vale a pena ler: manifestos e READMEs primeiro, depois docs em markdown, depois código das pastas mais "de domínio"
  const pontua = (p) => (IMPORTANTES.test(p) ? 3 : /\.md$/i.test(p) && p.split('/').length <= 3 ? 2 : CODIGO.test(p) && /(src|app|lib|api|services?|modules?|domain|routes?|controllers?|handlers?|workers?|jobs?)\//i.test(p) ? 1 : 0);
  const pontuaCodigo = (p) => (!CODIGO.test(p) || /(^|\/)(test|tests|__tests__|spec|vendor|dist|build|migrations?)\/|\.(test|spec|min)\./i.test(p) ? 0 : /(auth|login|senha|password|token|pay|pagamento|admin|api|route|controller|handler|db|sql|query|upload|webhook)/i.test(p) ? 3 : /(src|app|lib|server|servidor|services?|modules?|domain)\//i.test(p) ? 2 : 1);
  const [maxArq, maxTotal] = codigo ? [80, 420000] : [MAX_ARQUIVOS, MAX_TOTAL];
  const escolhidos = arvore.map(e => ({ ...e, pts: (codigo ? pontuaCodigo : pontua)(e.path) })).filter(e => e.pts > 0 && e.size <= 200000).sort((a, b) => b.pts - a.pts || a.path.length - b.path.length).slice(0, maxArq);
  const arquivos = []; let total = 0;
  for (const e of escolhidos) {
    if (total > maxTotal) break;
    const bruto = await F.conteudo(repo, branch, e.path, cred).catch(() => null); if (bruto == null) continue;
    const texto = String(bruto).slice(0, MAX_BYTES_ARQ); total += texto.length; arquivos.push({ caminho: e.path, texto });
  }
  return { provedor, repo, fonte: `${provedor}:${repo}`, branch, descricao: info.descricao, linguagem: info.linguagem, pastas: pastas.slice(0, 120), total: caminhos.length, arquivos, docs: caminhos.filter(p => /\.md$/i.test(p)).slice(0, 60), ler: (c) => F.conteudo(repo, branch, c, cred) };
}

// ---------- o pedido ao Claude ----------
const FORMATO = `{
  "titulo": "nome curto do sistema",
  "resumo": "duas frases sobre o que o sistema faz",
  "bairros": [
    { "id": "pedidos", "nome": "Pedidos", "sub": "subtítulo de 3 a 6 palavras", "desc": "o que o módulo faz, 1 a 2 frases",
      "operario": "nome do item que anda pelo fluxo (Pedido, Requisição, Job…)", "cada": 3,
      "estacoes": [ { "id": "pd-carrinho", "nome": "Carrinho", "desc": "1 frase", "chama": ["idDeRotaOpcional"] } ],
      "desvios": [ { "id": "pd-d-estoque", "nome": "Sem estoque", "de": "pd-estoque", "volta": "pd-checkout", "p": 0.08, "desc": "1 frase" } ],
      "docs": ["caminho/de/arquivo.md que explica este módulo"],
      "pastas": ["src/pedidos", "api/routes/orders.ts"] }
  ],
  "externos": [ { "id": "gateway", "nome": "Gateway de pagamento", "subn": "Stripe", "entra": "o que recebe", "sai": "o que devolve", "desc": "1 frase" } ],
  "rotas": [ { "id": "pgGateway", "de": "pg-autoriza", "para": "gateway" } ]
}`;
export function montarPedidoCidade(r) {
  const arquivos = r.arquivos.map(a => `### ${a.caminho}\n${a.texto}`).join('\n\n');
  return `Você vai transformar a arquitetura de um sistema numa "cidade": cada módulo ou serviço vira um BAIRRO, cada etapa do fluxo principal do módulo vira uma ESTAÇÃO (prédio), os caminhos de erro viram DESVIOS, e sistemas de fora (APIs de terceiros, gateways, ERPs, filas gerenciadas, bancos externos) viram EXTERNOS. Uma ROTA liga uma estação a um externo ou a uma estação de outro bairro que ela chama.

Regras:
- Entre 2 e 8 bairros. Cada bairro com 3 a 6 estações, na ordem em que o item passa por elas. 0 a 2 desvios por bairro.
- Ids em minúsculas com letras, números e hífen. Ids de estação e desvio começam com o prefixo do bairro (ex.: "pd-"). Todo id é único.
- "de" e "volta" dos desvios apontam para estações do mesmo bairro. "de" das rotas é uma estação; "para" é um externo ou uma estação de outro bairro.
- "chama" numa estação lista ids de rotas que saem dela.
- Em "docs", os caminhos de markdown do repositório (lista abaixo) que explicam aquele módulo; só os que existem.
- Em "pastas", os caminhos (pastas ou arquivos, da lista de pastas abaixo) onde mora o código daquele módulo: é assim que um commit sabe a que bairro pertence. Cada caminho aparece em UM bairro só; prefira o mais específico (src/pages/Kanban.tsx em vez de src/pages).
- Nomes e descrições em português, curtos, concretos, no vocabulário do próprio sistema. Nunca invente módulos que o código não mostra.
- Responda SOMENTE com o JSON, sem texto antes ou depois, neste formato:
${FORMATO}

Repositório: ${r.repo} (branch ${r.branch}) · linguagem principal: ${r.linguagem || '?'} · ${r.total} arquivos
Descrição: ${r.descricao || '(sem descrição)'}

Pastas:
${r.pastas.join('\n')}

Documentos markdown disponíveis:
${r.docs.join('\n') || '(nenhum)'}

Arquivos lidos:
${arquivos}`;
}

// ---------- validação e malha ----------
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
export function normalizar(bruto, { posicionar = true } = {}) {
  const c = { titulo: String(bruto.titulo || 'Cidade').slice(0, 60), resumo: String(bruto.resumo || '').slice(0, 400), bairros: [], externos: [], rotas: {}, ambiente: [], recortes: {} };
  const ids = new Set(), erro = (m) => { throw new ErroUso(`Cidade inválida: ${m}`); };
  const id = (x, oque) => { x = String(x || '').toLowerCase().trim(); if (!ID.test(x)) erro(`${oque} com id inválido "${x}"`); if (ids.has(x)) erro(`id repetido "${x}"`); ids.add(x); return x; };
  for (const b of (bruto.bairros || []).slice(0, 10)) {
    const bid = id(b.id, 'bairro'), est = (b.estacoes || []).slice(0, 8).map(e => ({ id: id(e.id, 'estação'), nome: String(e.nome || e.id).slice(0, 40), desc: String(e.desc || '').slice(0, 300), ...(Array.isArray(e.chama) && e.chama.length ? { chama: e.chama.map(String) } : {}) }));
    if (est.length < 2) continue;   // bairro com uma estação só não forma fluxo: fica de fora em vez de derrubar a cidade inteira
    const eids = new Set(est.map(e => e.id));
    const desvios = (b.desvios || []).slice(0, 3).map(d => ({ id: id(d.id, 'desvio'), nome: String(d.nome || d.id).slice(0, 40), de: String(d.de), volta: String(d.volta || d.de), p: Math.min(0.5, Math.max(0.01, Number(d.p) || 0.06)), desc: String(d.desc || '').slice(0, 300) }))
      .filter(d => eids.has(d.de) && eids.has(d.volta));
    c.bairros.push({ id: bid, nome: String(b.nome || bid).slice(0, 40), sub: String(b.sub || '').slice(0, 60), desc: String(b.desc || '').slice(0, 400), operario: String(b.operario || 'Item').slice(0, 30),
      cada: Math.min(10, Math.max(1, Number(b.cada) || 3)), porLinha: 3, estacoes: est, desvios, docs: (b.docs || []).filter(x => typeof x === 'string').slice(0, 12), pastas: (b.pastas || []).filter(x => typeof x === 'string').map(x => x.replace(/^\/+|\/+$/g, '')).filter(Boolean).slice(0, 20) });
  }
  if (!c.bairros.length) erro('nenhum bairro');
  for (const e of (bruto.externos || []).slice(0, 10)) c.externos.push({ id: id(e.id, 'externo'), nome: String(e.nome || e.id).slice(0, 40), subn: String(e.subn || '').slice(0, 30) || undefined, entra: String(e.entra || '').slice(0, 80), sai: String(e.sai || '').slice(0, 80), desc: String(e.desc || '').slice(0, 300), f: [8, 8], h: 12 });
  const rotasLista = Array.isArray(bruto.rotas) ? bruto.rotas : Object.entries(bruto.rotas || {}).map(([k, v]) => ({ id: k, ...v }));
  for (const r of rotasLista.slice(0, 40)) { const rid = String(r.id || `${r.de}-${r.para}`).replace(/[^A-Za-z0-9_-]/g, ''); if (ids.has(String(r.de)) && ids.has(String(r.para)) && r.de !== r.para) c.rotas[rid] = { de: String(r.de), para: String(r.para), cor: 0x3fa9f5 }; }
  for (const b of c.bairros) for (const e of b.estacoes) if (e.chama) { e.chama = e.chama.filter(x => c.rotas[x] && c.rotas[x].de === e.id); if (!e.chama.length) delete e.chama; }
  for (const [k, r] of Object.entries(c.rotas)) if (c.externos.some(x => x.id === r.para)) c.ambiente.push({ rota: k, cada: 5, volta: 0x5fd38d });
  if (posicionar) posicionarNaMalha(c);
  return c;
}
// bairros lado a lado numa linha (4 colunas cada, um quarteirão de folga); os externos numa fileira acima, perto de quem os chama
function posicionarNaMalha(c) {
  const CORES = [0x3fa9f5, 0x5fd38d, 0xff9d3c, 0xa78bfa, 0xf472b6, 0x4fd1c5, 0xffd24a, 0xff5d6c, 0x8b9cf9, 0x86efac];
  // até 4 bairros por fileira; a fileira de baixo fica 7 quarteirões abaixo (cabe um bairro de 6 linhas e a rua)
  const porFileira = 4, fileiras = Math.ceil(c.bairros.length / porFileira);
  c.bairros.forEach((b, i) => { const f = Math.floor(i / porFileira), n = Math.min(porFileira, c.bairros.length - f * porFileira), x = (i % porFileira) * 5 - Math.floor(n * 5 / 2);
    const linhas = Math.ceil(b.estacoes.length / 3) * (b.desvios.length ? 2 : 1); b.grade = [x, f * 8, 4, Math.max(2, linhas)]; b.cor = CORES[i % CORES.length]; b.x0 = x; b.y0 = f * 8; if (i === 0) b.foco = true; });
  const porExterno = {}; for (const r of Object.values(c.rotas)) { const b = c.bairros.find(b => b.estacoes.some(e => e.id === r.de)); if (b && c.externos.some(x => x.id === r.para)) porExterno[r.para] ??= b.x0 + 1; }
  const usados = new Set();
  c.externos.forEach((e, i) => { let q = porExterno[e.id] ?? (c.bairros[0].x0 + i * 2); while (usados.has(q)) q += 1; usados.add(q); e.q = [q, -3]; });
  if (fileiras > 1) for (const b of c.bairros) delete b.y0;
  for (const b of c.bairros) { b.estacoes = b.estacoes.map(e => ({ ...e })); }
  c.recortes = Object.fromEntries(c.bairros.map(b => [b.id, c.externos.filter(e => Object.values(c.rotas).some(r => r.para === e.id && b.estacoes.some(s => s.id === r.de))).map(e => e.id)]));
}

// ---------- o JS que a página carrega ----------
export function paraJs(def, { catalogo } = {}) {
  const d = { titulo: def.titulo, bairros: def.bairros.map(({ docs, pastas, x0, y0, ...b }) => b), externos: def.externos, rotas: def.rotas, ambiente: def.ambiente, recortes: def.recortes, ...(catalogo ? { catalogo: 'catalogo.js' } : {}) };
  return `SystemCity.definir(${JSON.stringify(d)});\n`;
}

// gera definição, catálogo e textos a partir do repositório (usado ao criar e ao regerar)
async function gerarDoRepo(fonte, cred, { nome } = {}) {
  const lido = await lerRepositorio(fonte, cred), def = normalizar(await perguntar(montarPedidoCidade(lido), { json: true, maxTokens: 16000 })); if (nome) def.titulo = String(nome).slice(0, 60);
  const catalogo = { geradoEm: new Date().toISOString(), repos: [{ repo: lido.repo, branch: lido.branch, commit: '' }], bairros: {} }, textos = {};
  for (const b of def.bairros) { let k = 0;
    for (const caminho of b.docs || []) { if (!lido.docs.includes(caminho)) continue;
      const bruto = await lido.ler(caminho).catch(() => null); if (bruto == null) continue;
      const md = String(bruto).slice(0, 60000), titulo = (md.match(/^#\s+(.+)$/m) || [])[1]?.trim() || caminho.split('/').pop(), chave = `${lido.repo}/${caminho}`;
      (catalogo.bairros[b.id] ??= []).push({ id: `${b.id}-doc-${k++}`, bairro: b.id, natureza: /adr/i.test(caminho) ? 'adr' : 'spec', slug: caminho, titulo, status: null, classe: 'sem', rn: 0, repos: [lido.repo], docs: [{ chave, repo: lido.repo, caminho: chave, tipo: /adr/i.test(caminho) ? 'ADR' : 'Documento', titulo, status: null, rn: 0, ca: 0 }] });
      (textos[b.id] ??= {})[chave] = md; } }
  return { lido, definicao: def, catalogo, textos };
}
// o que mudou entre duas versões da cidade: bairros e prédios que entraram ou saíram
export function diferencas(antes, depois) {
  const predios = (d) => new Map([...d.bairros.flatMap(b => b.estacoes.map(e => [e.id, `${e.nome} (${b.nome})`])), ...d.externos.map(e => [e.id, `${e.nome} (de fora)`])]);
  const ba = new Map(antes.bairros.map(b => [b.id, b.nome])), bd = new Map(depois.bairros.map(b => [b.id, b.nome])), pa = predios(antes), pd = predios(depois);
  return { bairrosNovos: [...bd].filter(([k]) => !ba.has(k)).map(([, v]) => v), bairrosSairam: [...ba].filter(([k]) => !bd.has(k)).map(([, v]) => v),
    prediosNovos: [...pd].filter(([k]) => !pa.has(k)).map(([, v]) => v), prediosSairam: [...pa].filter(([k]) => !pd.has(k)).map(([, v]) => v) };
}

// ---------- banco ----------
export function cidades(db, { equipes, conexoes }) {
  const q = {
    nova: db.prepare('INSERT INTO cidades (slug, nome, dono, equipe, fonte, definicao, catalogo, textos, criada, atualizada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    porSlug: db.prepare('SELECT * FROM cidades WHERE slug = ?'),
    minhas: db.prepare(`SELECT c.id, c.slug, c.nome, c.dono, c.equipe, c.fonte, c.criada, c.atualizada, e.nome AS equipe_nome FROM cidades c LEFT JOIN equipes e ON e.id = c.equipe
      WHERE c.dono = ? OR c.equipe IN (SELECT equipe FROM equipe_membros WHERE usuario = ?) ORDER BY c.atualizada DESC`),
    apagar: db.prepare('DELETE FROM cidades WHERE id = ?'), atualizar: db.prepare('UPDATE cidades SET definicao = ?, catalogo = ?, textos = ?, atualizada = ? WHERE id = ?'),
    webhook: db.prepare('UPDATE cidades SET webhook = ? WHERE id = ?'), versao: db.prepare('UPDATE cidades SET definicao = ?, catalogo = ?, textos = ?, anterior = ?, atualizada = ? WHERE id = ?'),
    token: db.prepare('SELECT github_token FROM usuarios WHERE id = ?'), guardarToken: db.prepare('UPDATE usuarios SET github_token = ? WHERE id = ?'),
  };
  const regerando = new Set();
  const podeVer = (c, u) => c.dono === u || (c.equipe && equipes.membrosDe(c.equipe).includes(u));
  const slugLivre = (base) => { let s = slugDe(base), k = 1; while (q.porSlug.get(s)) s = `${slugDe(base).slice(0, 36)}-${++k}`; return s; };
  const guardar = (u, { nome, equipe, fonte, definicao, catalogo = null, textos = null }) => {
    if (equipe && !equipes.membrosDe(equipe).includes(u)) throw new ErroUso('Você não está nessa equipe.', 403);
    const agora = Date.now(), slug = slugLivre(nome), { lastInsertRowid } = q.nova.run(slug, nome, u, equipe || null, fonte, JSON.stringify(definicao), catalogo && JSON.stringify(catalogo), textos && JSON.stringify(textos), agora, agora);
    return { id: Number(lastInsertRowid), slug, nome };
  };

  return {
    // a lista da página de projetos: com um mapa mínimo (a grade e a cor de cada bairro) para desenhar a miniatura, e a última auditoria
    minhas(u) {
      const ultimaAud = (() => { try { return db.prepare("SELECT estado, achados FROM auditorias WHERE cidade = ? ORDER BY id DESC LIMIT 1"); } catch { return null; } })();
      return db.prepare(`SELECT c.id, c.slug, c.nome, c.dono, c.equipe, c.fonte, c.criada, c.atualizada, c.universo, c.definicao, e.nome AS equipe_nome FROM cidades c LEFT JOIN equipes e ON e.id = c.equipe
        WHERE c.dono = ? OR c.equipe IN (SELECT equipe FROM equipe_membros WHERE usuario = ?) ORDER BY c.atualizada DESC`).all(u, u).map(({ definicao, ...c }) => {
        let d = {}; try { d = JSON.parse(definicao); } catch {}
        const a = ultimaAud && ultimaAud.get(c.slug), achados = a ? JSON.parse(a.achados) : [];
        return { ...c, resumo: String(d.resumo || '').slice(0, 220), mapa: { b: (d.bairros || []).map(b => [...b.grade, b.cor || 0x37e6ff, (b.estacoes || []).length]), e: (d.externos || []).map(x => [...x.q, ...(x.f || [8, 8])]) },
          bairros: (d.bairros || []).length, auditoria: a ? { estado: a.estado, graves: achados.filter(x => x.severidade === 'critica' || x.severidade === 'alta').length, total: achados.length } : null };
      });
    },
    ver(slug, u) { const c = q.porSlug.get(slug); if (!c || !podeVer(c, u)) throw new ErroUso('Cidade não encontrada.', 404); return { ...c, definicao: JSON.parse(c.definicao), catalogo: c.catalogo ? JSON.parse(c.catalogo) : null, textos: c.textos ? JSON.parse(c.textos) : null }; },
    js(slug, u) { const c = this.ver(slug, u); return paraJs(c.definicao, { catalogo: !!c.catalogo }); },
    catalogoJs(slug, u) { const c = this.ver(slug, u); return `window.CIDADE_SPECS = ${JSON.stringify(c.catalogo || { repos: [], bairros: {} })};\n`; },
    textosJs(slug, bairro, u) { const c = this.ver(slug, u); return `(window.CIDADE_TEXTOS = window.CIDADE_TEXTOS || {})[${JSON.stringify(bairro)}] = ${JSON.stringify((c.textos || {})[bairro] || {})};\n`; },
    apagar(slug, u) { const c = q.porSlug.get(slug); if (!c || c.dono !== u) throw new ErroUso('Só quem criou a cidade pode apagá-la.', 403); q.apagar.run(c.id); },
    conectarGithub(u, token) { token = String(token || '').trim(); if (token && !/^(ghp_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token)) throw new ErroUso('Isso não parece um token do GitHub (começa com ghp_ ou github_pat_).'); q.guardarToken.run(token || null, u); return { conectado: !!token }; },
    githubConectado: (u) => !!(q.token.get(u) || {}).github_token,

    modelos() { if (!existsSync(MODELOS)) return []; return readdirSync(MODELOS).filter(f => f.endsWith('.json')).map(f => { const m = JSON.parse(readFileSync(join(MODELOS, f), 'utf8')); return { id: f.replace(/\.json$/, ''), titulo: m.titulo, resumo: m.resumo, bairros: m.bairros.length }; }); },
    doModelo(u, { modelo, nome, equipe }) {
      const arq = join(MODELOS, `${String(modelo).replace(/[^a-z0-9-]/g, '')}.json`); if (!existsSync(arq)) throw new ErroUso('Modelo não encontrado.', 404);
      const def = normalizar(JSON.parse(readFileSync(arq, 'utf8'))); if (nome) def.titulo = String(nome).slice(0, 60);
      return guardar(u, { nome: def.titulo, equipe, fonte: `modelo:${modelo}`, definicao: def });
    },
    // gera de qualquer fonte ligada: "repo" pode vir com o prefixo do provedor (bitbucket:…, codecommit:…); sem prefixo é GitHub
    doGithub(u, d) { return this.doRepo(u, d); },
    async doRepo(u, { repo, fonte, equipe, nome }) {
      const { provedor } = separarFonte(fonte || repo), g = await gerarDoRepo(fonte || repo, conexoes.cred(u, provedor), { nome });
      const c = guardar(u, { nome: g.definicao.titulo, equipe, fonte: g.lido.fonte, definicao: g.definicao, catalogo: g.catalogo, textos: g.textos });
      q.webhook.run(randomBytes(24).toString('hex'), c.id); return { ...c, resumo: g.definicao.resumo, bairros: g.definicao.bairros.length, lidos: g.lido.arquivos.length };
    },
    // regera a cidade com o que está hoje no repositório; guarda a versão anterior e devolve o que mudou
    async regerar(slug, u = null) {
      const c = q.porSlug.get(slug); if (!c || !ehRepositorio(c.fonte)) throw new ErroUso('Só cidades geradas de um repositório podem ser regeradas.', 400);
      if (u != null && !podeVer(c, u)) throw new ErroUso('Cidade não encontrada.', 404);
      if (regerando.has(slug)) throw new ErroUso('Esta cidade já está sendo regerada.', 409); regerando.add(slug);
      try { const antes = JSON.parse(c.definicao), g = await gerarDoRepo(c.fonte, conexoes.cred(c.dono, separarFonte(c.fonte).provedor), { nome: c.nome });
        q.versao.run(JSON.stringify(g.definicao), JSON.stringify(g.catalogo), JSON.stringify(g.textos), c.definicao, Date.now(), c.id);
        return { slug, mudancas: diferencas(antes, g.definicao), membros: c.equipe ? equipes.membrosDe(c.equipe) : [c.dono] }; }
      finally { regerando.delete(slug); }
    },
    webhookDe(slug, u) { const c = q.porSlug.get(slug); if (!c || c.dono !== u) throw new ErroUso('Só quem criou a cidade vê o webhook.', 403); if (!c.webhook) { q.webhook.run(randomBytes(24).toString('hex'), c.id); return q.porSlug.get(slug).webhook; } return c.webhook; },
    // o GitHub assina o corpo com o segredo da cidade (X-Hub-Signature-256); só push na branch padrão regera
    conferirWebhook(slug, assinatura, bruto) { const c = q.porSlug.get(slug); if (!c || !c.webhook) throw new ErroUso('Cidade não encontrada.', 404);
      const esperado = 'sha256=' + createHmac('sha256', c.webhook).update(bruto).digest('hex'), a = Buffer.from(String(assinatura || '')), b = Buffer.from(esperado);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ErroUso('Assinatura inválida.', 401); return c; },
  };
}
