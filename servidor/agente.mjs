// O agente de código: o Claude (pela API da Anthropic) trabalha num repositório do GitHub junto com um dev.
// Ele lista pastas, lê arquivos, busca no código e PROPÕE alterações (ficam guardadas na sessão, nada vai para o GitHub).
// O dev acompanha cada passo ao vivo, conversa com o agente e, quando estiver bom, ele mesmo clica em "Abrir PR":
// aí o servidor cria a branch systemcity/agente-<id>, faz o commit e abre o Pull Request. A branch principal nunca é tocada.
// Precisa de ANTHROPIC_API_KEY (o laço de ferramentas não roda pelo `claude -p`) e do token do GitHub de quem pediu
// (leitura para trabalhar; escrita de conteúdo e de pull requests para abrir o PR).
import { ErroUso } from './contas.mjs';
import { anotar, comUso } from './custos.mjs';

const MODELO = process.env.AGENTE_MODELO || process.env.CLAUDE_MODELO || 'claude-opus-5-5', MAX_VOLTAS = 30, MAX_ARQ = 60000;

const FERRAMENTAS = [
  { name: 'listar_pasta', description: 'Lista arquivos e subpastas de uma pasta do repositório. Use "" para a raiz.', input_schema: { type: 'object', properties: { caminho: { type: 'string' } }, required: ['caminho'], additionalProperties: false } },
  { name: 'ler_arquivo', description: 'Lê o conteúdo de um arquivo do repositório (o que já foi alterado nesta sessão aparece com a alteração).', input_schema: { type: 'object', properties: { caminho: { type: 'string' } }, required: ['caminho'], additionalProperties: false } },
  { name: 'buscar', description: 'Procura um texto nos caminhos dos arquivos e, se houver token, no código do repositório. Devolve até 30 caminhos.', input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'], additionalProperties: false } },
  { name: 'propor_alteracao', description: 'Propõe o conteúdo NOVO e COMPLETO de um arquivo (criar ou alterar). Não grava no GitHub: o dev revisa e decide abrir o PR. Para apagar um arquivo, mande conteudo vazio e apagar=true.', input_schema: { type: 'object', properties: { caminho: { type: 'string' }, conteudo: { type: 'string' }, motivo: { type: 'string' }, apagar: { type: 'boolean' } }, required: ['caminho', 'conteudo', 'motivo'], additionalProperties: false } },
];

const SISTEMA = (repo, contexto) => `Você é um engenheiro de software trabalhando no repositório ${repo}, em par com um dev humano que acompanha tudo e decide o que vira Pull Request.

Como trabalhar:
- Antes de alterar, entenda: liste as pastas que importam, leia os arquivos envolvidos e os testes. Não chute nomes de função ou caminhos.
- Faça a menor mudança que resolve o pedido, no estilo do código que já existe. Se faltar teste para o que você mudou, proponha o teste também.
- Proponha cada arquivo alterado com propor_alteracao (conteúdo completo do arquivo). Você não consegue rodar o código nem os testes: diga o que o dev deve rodar para conferir.
- Se o pedido estiver ambíguo ou arriscado (apagar dados, mudar contrato de API, mexer em segredos), pergunte antes de propor.
- Ao terminar, responda em português, em poucas linhas: o que mudou, por quê, e o que o dev precisa conferir. Não repita o código na resposta.
${contexto ? `\nContexto da cidade (a arquitetura deste repositório desenhada como bairros e prédios):\n${contexto}` : ''}`;

export function agentes(db, { contas, rt, cidades }) {
  const q = {
    nova: db.prepare('INSERT INTO agentes (repo, cidade, criado_por, titulo, estado, mensagens, passos, alteracoes, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    uma: db.prepare('SELECT * FROM agentes WHERE id = ?'),
    salvar: db.prepare('UPDATE agentes SET estado = ?, mensagens = ?, passos = ?, alteracoes = ?, pr_url = coalesce(?, pr_url), atualizado = ? WHERE id = ?'),
    daCidade: db.prepare('SELECT id, repo, titulo, estado, pr_url, criado_por, criado, atualizado FROM agentes WHERE cidade = ? ORDER BY id DESC LIMIT 30'),
    token: db.prepare('SELECT github_token FROM usuarios WHERE id = ?'),
  };
  const rodando = new Map();   // id -> { arvore, pararPedido }
  let cliente = null;
  const anthropic = async () => { if (!process.env.ANTHROPIC_API_KEY) throw new ErroUso('O agente precisa da ANTHROPIC_API_KEY no servidor.', 503);
    if (!cliente) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); cliente = new Anthropic({ timeout: 10 * 60e3 }); } return cliente; };

  async function gh(caminho, token, opcoes = {}) {
    const r = await fetch(`https://api.github.com${caminho}`, { ...opcoes, headers: { accept: 'application/vnd.github+json', 'user-agent': 'systemcity', 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    const txt = await r.text(), dado = txt ? JSON.parse(txt) : null;
    if (!r.ok) { const m = (dado && dado.message) || `GitHub respondeu ${r.status}`; throw new ErroUso(r.status === 403 || r.status === 404 ? `${m}. O token do GitHub precisa de acesso a este repositório${opcoes.method ? ' com permissão de escrita (Contents e Pull requests)' : ''}.` : m, r.status === 404 ? 404 : 502); }
    return dado;
  }
  const lerSessao = (id) => { const s = q.uma.get(id); if (!s) throw new ErroUso('Sessão não encontrada.', 404); return { ...s, mensagens: JSON.parse(s.mensagens), passos: JSON.parse(s.passos), alteracoes: JSON.parse(s.alteracoes) }; };
  const podeVer = (s, u) => { if (s.criado_por === u) return true; try { cidades.ver(s.cidade, u); return true; } catch { return false; } };
  const exigir = (id, u) => { const s = lerSessao(id); if (!podeVer(s, u)) throw new ErroUso('Sessão não encontrada.', 404); return s; };
  const guardar = (s, prUrl = null) => { s.atualizado = Date.now(); q.salvar.run(s.estado, JSON.stringify(s.mensagens), JSON.stringify(s.passos), JSON.stringify(s.alteracoes), prUrl, s.atualizado, s.id); };
  const quemVe = (s) => { try { const c = db.prepare('SELECT * FROM cidades WHERE slug = ?').get(s.cidade); return c && c.equipe ? db.prepare('SELECT usuario FROM equipe_membros WHERE equipe = ?').all(c.equipe).map(r => r.usuario) : [s.criado_por]; } catch { return [s.criado_por]; } };
  const passo = (s, p) => { const item = { ...p, quando: Date.now() }; s.passos.push(item); for (const m of quemVe(s)) rt.para(m, { t: 'agente:passo', sessao: s.id, passo: item, estado: s.estado }); };

  // ---------- as ferramentas, executadas contra o GitHub ----------
  async function arvore(s, token) { const r = rodando.get(s.id) || {}; if (r.arvore) return r.arvore;
    const info = await gh(`/repos/${s.repo}`, token), t = await gh(`/repos/${s.repo}/git/trees/${info.default_branch}?recursive=1`, token);
    r.arvore = { branch: info.default_branch, arquivos: t.tree.filter(e => e.type === 'blob').map(e => e.path) }; rodando.set(s.id, r); return r.arvore; }
  async function lerOriginal(s, token, caminho) { const a = await arvore(s, token); if (!a.arquivos.includes(caminho)) return null;
    const c = await gh(`/repos/${s.repo}/contents/${encodeURIComponent(caminho).replace(/%2F/g, '/')}?ref=${a.branch}`, token); return Buffer.from(c.content || '', 'base64').toString('utf8'); }
  const limpo = (c) => String(c || '').replace(/^\.?\/+/, '').replace(/\/+$/, '');
  async function executar(s, token, nome, entrada) {
    if (nome === 'listar_pasta') { const p = limpo(entrada.caminho), a = await arvore(s, token), filhos = new Set();
      for (const f of a.arquivos) if (!p || f.startsWith(p + '/')) { const resto = p ? f.slice(p.length + 1) : f, parte = resto.split('/')[0]; filhos.add(resto.includes('/') ? parte + '/' : parte); }
      for (const al of s.alteracoes) if (!al.apagar && (!p || al.caminho.startsWith(p + '/'))) filhos.add((p ? al.caminho.slice(p.length + 1) : al.caminho).split('/')[0] + (al.caminho.slice(p ? p.length + 1 : 0).includes('/') ? '/' : ''));
      return filhos.size ? [...filhos].sort().slice(0, 300).join('\n') : `Pasta "${p}" vazia ou inexistente.`; }
    if (nome === 'ler_arquivo') { const p = limpo(entrada.caminho), al = s.alteracoes.find(x => x.caminho === p); if (al) return al.apagar ? '(arquivo apagado nesta sessão)' : al.conteudo.slice(0, MAX_ARQ);
      const t = await lerOriginal(s, token, p); return t == null ? `Arquivo "${p}" não existe.` : t.length > MAX_ARQ ? t.slice(0, MAX_ARQ) + `\n…(cortado: ${t.length} caracteres)` : t; }
    if (nome === 'buscar') { const txt = String(entrada.texto || '').slice(0, 100), a = await arvore(s, token), achados = new Set(a.arquivos.filter(f => f.toLowerCase().includes(txt.toLowerCase())).slice(0, 15));
      if (token) { const r = await gh(`/search/code?per_page=20&q=${encodeURIComponent(`${txt} repo:${s.repo}`)}`, token).catch(() => null); for (const i of (r && r.items) || []) achados.add(i.path); }
      return achados.size ? [...achados].slice(0, 30).join('\n') : 'Nada encontrado.'; }
    if (nome === 'propor_alteracao') { const p = limpo(entrada.caminho); if (!p || p.includes('..')) return 'Caminho inválido.';
      const original = s.alteracoes.find(x => x.caminho === p)?.original ?? await lerOriginal(s, token, p);
      s.alteracoes = s.alteracoes.filter(x => x.caminho !== p).concat({ caminho: p, original, conteudo: String(entrada.conteudo), motivo: String(entrada.motivo || '').slice(0, 400), apagar: !!entrada.apagar });
      passo(s, { tipo: 'alteracao', caminho: p, motivo: entrada.motivo, novo: original == null, apagar: !!entrada.apagar }); return `Alteração em ${p} guardada para o dev revisar.`; }
    return `Ferramenta desconhecida: ${nome}`;
  }

  // ---------- o laço do agente ----------
  async function rodar(id) {
    const s = lerSessao(id), token = (q.token.get(s.criado_por) || {}).github_token || null, ctl = rodando.get(id) || {}; ctl.parar = false; rodando.set(id, ctl);
    s.estado = 'trabalhando'; guardar(s);
    try {
      const api = await anthropic(), contexto = s.cidade ? (() => { try { const c = db.prepare('SELECT definicao FROM cidades WHERE slug = ?').get(s.cidade); const d = JSON.parse(c.definicao); return d.bairros.map(b => `- ${b.nome} (${(b.pastas || []).join(', ') || 'pastas não mapeadas'}): ${b.desc || ''}`).join('\n'); } catch { return ''; } })() : '';
      for (let volta = 0; volta < MAX_VOLTAS; volta++) {
        if (ctl.parar) { s.estado = 'esperando'; passo(s, { tipo: 'aviso', texto: 'Parado pelo dev.' }); break; }
        const t0 = Date.now(), r = await api.beta.messages.create({ model: MODELO, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          output_config: { effort: 'high' }, system: SISTEMA(s.repo, contexto), tools: FERRAMENTAS, messages: s.mensagens });
        comUso({ usuario: s.criado_por, tipo: 'agente', alvo: s.repo }, () => anotar({ modelo: r.model || MODELO, via: 'api', uso: r.usage, ms: Date.now() - t0 }));
        s.mensagens.push({ role: 'assistant', content: r.content });   // a resposta inteira, pensamentos incluídos: a conversa só cresce, nunca é editada
        for (const b of r.content) if (b.type === 'text' && b.text.trim()) passo(s, { tipo: 'fala', texto: b.text.trim() });
        if (r.stop_reason === 'refusal') { s.estado = 'esperando'; passo(s, { tipo: 'aviso', texto: 'O Claude recusou este pedido.' }); break; }
        if (r.stop_reason === 'pause_turn') { guardar(s); continue; }
        const usos = r.content.filter(b => b.type === 'tool_use'); if (!usos.length) { s.estado = 'esperando'; break; }
        const resultados = [];
        for (const t of usos) { if (t.name !== 'propor_alteracao') passo(s, { tipo: 'ferramenta', nome: t.name, alvo: t.input.caminho ?? t.input.texto ?? '' });
          let saida; try { saida = await executar(s, token, t.name, t.input || {}); } catch (e) { saida = `Erro: ${e.message}`; }
          resultados.push({ type: 'tool_result', tool_use_id: t.id, content: String(saida) }); }
        s.mensagens.push({ role: 'user', content: resultados }); guardar(s);
      }
      if (s.estado === 'trabalhando') { s.estado = 'esperando'; passo(s, { tipo: 'aviso', texto: `Parei depois de ${MAX_VOLTAS} passos. Diga se é para continuar.` }); }
    } catch (e) { s.estado = 'erro'; passo(s, { tipo: 'aviso', texto: `Erro: ${e.message}` }); }
    guardar(s); passo(s, { tipo: 'estado' });
  }

  return {
    daCidade: (slug, u) => { cidades.ver(slug, u); return q.daCidade.all(slug); },
    ver: (id, u) => { const s = exigir(id, u); return { ...s, mensagens: undefined }; },
    async criar(u, { cidade, repo, pedido, foco }) {
      await anthropic(); pedido = String(pedido || '').trim().slice(0, 4000); if (!pedido) throw new ErroUso('Diga o que o agente deve fazer.');
      const c = cidades.ver(cidade, u); repo = String(repo || c.fonte.replace(/^github:/, '')).replace(/^https?:\/\/github\.com\//, '');
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new ErroUso('Repositório inválido.');
      if (!(q.token.get(u) || {}).github_token) throw new ErroUso('Conecte seu GitHub (página Cidades) para o agente trabalhar no repositório.', 400);
      const texto = foco ? `${pedido}\n\n(O dev apontou na cidade: ${foco}.)` : pedido, agora = Date.now();
      const { lastInsertRowid } = q.nova.run(repo, cidade, u, pedido.split('\n')[0].slice(0, 120), 'trabalhando', JSON.stringify([{ role: 'user', content: texto }]), JSON.stringify([{ tipo: 'pedido', texto, quem: contas.usuario(u).nome, quando: agora }]), '[]', agora, agora);
      const id = Number(lastInsertRowid); rodar(id); return lerSessao(id);
    },
    responder(id, u, texto) { const s = exigir(id, u); if (s.estado === 'trabalhando') throw new ErroUso('O agente ainda está trabalhando. Espere ou peça para parar.', 409);
      texto = String(texto || '').trim().slice(0, 4000); if (!texto) throw new ErroUso('Escreva uma mensagem.');
      s.mensagens.push({ role: 'user', content: texto }); passo(s, { tipo: 'pedido', texto, quem: contas.usuario(u).nome }); guardar(s); rodar(id); return { ok: true }; },
    parar(id, u) { exigir(id, u); const ctl = rodando.get(id); if (ctl) ctl.parar = true; return { ok: true }; },
    descartar(id, u, caminho) { const s = exigir(id, u); s.alteracoes = s.alteracoes.filter(a => a.caminho !== caminho); s.mensagens.push({ role: 'user', content: `(O dev descartou a alteração em ${caminho}.)` });
      passo(s, { tipo: 'aviso', texto: `Alteração em ${caminho} descartada.` }); guardar(s); return { ok: true }; },
    // o dev aprova: branch nova a partir da principal, um commit com todas as alterações e o Pull Request
    async abrirPR(id, u, { titulo, descricao }) {
      const s = exigir(id, u); if (!s.alteracoes.length) throw new ErroUso('Não há alterações para o PR.'); if (s.pr_url) throw new ErroUso('Esta sessão já abriu um PR.', 409);
      const token = (q.token.get(u) || {}).github_token; if (!token) throw new ErroUso('Conecte seu GitHub para abrir o PR.', 400);
      const info = await gh(`/repos/${s.repo}`, token), base = await gh(`/repos/${s.repo}/git/ref/heads/${info.default_branch}`, token), commitBase = await gh(`/repos/${s.repo}/git/commits/${base.object.sha}`, token);
      const arvoreNova = await gh(`/repos/${s.repo}/git/trees`, token, { method: 'POST', body: JSON.stringify({ base_tree: commitBase.tree.sha, tree: s.alteracoes.map(a => a.apagar ? { path: a.caminho, mode: '100644', type: 'blob', sha: null } : { path: a.caminho, mode: '100644', type: 'blob', content: a.conteudo }) }) });
      const msg = String(titulo || s.titulo).slice(0, 120), quem = contas.usuario(u);
      const commit = await gh(`/repos/${s.repo}/git/commits`, token, { method: 'POST', body: JSON.stringify({ message: `${msg}\n\nProposto pelo agente do SystemCity e revisado por ${quem.nome} (@${quem.nick}).`, tree: arvoreNova.sha, parents: [base.object.sha] }) });
      const branch = `systemcity/agente-${s.id}`; await gh(`/repos/${s.repo}/git/refs`, token, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) });
      const corpo = `${descricao || ''}\n\n### Arquivos\n${s.alteracoes.map(a => `- \`${a.caminho}\`${a.apagar ? ' (apagado)' : a.original == null ? ' (novo)' : ''}: ${a.motivo}`).join('\n')}\n\n---\nProposto pelo agente do SystemCity a pedido de ${quem.nome}. Revise e rode os testes antes de aprovar.`;
      const pr = await gh(`/repos/${s.repo}/pulls`, token, { method: 'POST', body: JSON.stringify({ title: msg, head: branch, base: info.default_branch, body: corpo }) });
      s.estado = 'pr'; passo(s, { tipo: 'pr', url: pr.html_url, numero: pr.number }); guardar(s, pr.html_url); return { url: pr.html_url, numero: pr.number };
    },
  };
}
