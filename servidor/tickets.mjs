// Tickets de verdade: cada equipe liga o seu sistema (GitHub Issues, Jira ou Linear) e as atividades das atas viram ticket com um clique.
// A credencial fica no banco, só o dono ou um admin da equipe vê ou troca; quem é membro só abre tickets.
import { ErroUso } from './contas.mjs';

const TIPOS = ['github', 'jira', 'linear'];
const corpoDe = (a) => [a.descricao, a.responsavel && `Responsável: ${a.responsavel}`, a.prazo && `Prazo: ${a.prazo}`, a.bairro && `Bairro da cidade: ${a.bairro}`, '', '_Aberto pelo SystemCity, a partir da ata de uma reunião._'].filter(x => x != null && x !== false).join('\n');

async function pedir(f, url, opcoes, quem) {
  const r = await f(url, opcoes); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  if (!r.ok) throw new ErroUso(`${quem} recusou o ticket (${r.status}): ${String((j && (j.message || (j.errorMessages || [])[0] || (j.errors && JSON.stringify(j.errors)))) || txt).slice(0, 200)}`, 502);
  return j;
}

// cada sistema: recebe a configuração e a atividade, devolve o link do ticket criado
const SISTEMAS = {
  async github(c, a, f) {
    const j = await pedir(f, `https://api.github.com/repos/${c.repo}/issues`, { method: 'POST', headers: { accept: 'application/vnd.github+json', 'user-agent': 'systemcity', authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: a.titulo, body: corpoDe(a), ...(c.rotulo ? { labels: [c.rotulo] } : {}) }) }, 'O GitHub');
    return j.html_url;
  },
  async jira(c, a, f) {
    const site = c.site.replace(/\/+$/, ''), paragrafos = corpoDe(a).split('\n').filter(Boolean).map(t => ({ type: 'paragraph', content: [{ type: 'text', text: t }] }));
    const j = await pedir(f, `${site}/rest/api/3/issue`, { method: 'POST', headers: { authorization: 'Basic ' + Buffer.from(`${c.email}:${c.token}`).toString('base64'), accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { project: { key: c.projeto }, summary: a.titulo, issuetype: { name: c.tipo || 'Task' }, description: { type: 'doc', version: 1, content: paragrafos } } }) }, 'O Jira');
    return `${site}/browse/${j.key}`;
  },
  async linear(c, a, f) {
    const gql = (query, variables) => pedir(f, 'https://api.linear.app/graphql', { method: 'POST', headers: { authorization: c.token, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) }, 'O Linear');
    const t = await gql('query($k: String!) { teams(filter: { key: { eq: $k } }) { nodes { id } } }', { k: c.time });
    const time = (((t.data || {}).teams || {}).nodes || [])[0]; if (!time) throw new ErroUso(`Não achei o time "${c.time}" no Linear.`, 502);
    const r = await gql('mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success issue { url } } }', { i: { teamId: time.id, title: a.titulo, description: corpoDe(a) } });
    const url = (((r.data || {}).issueCreate || {}).issue || {}).url; if (!url) throw new ErroUso('O Linear não criou o ticket.', 502); return url;
  },
};
const CAMPOS = { github: ['repo', 'token'], jira: ['site', 'email', 'token', 'projeto'], linear: ['token', 'time'] };
const OPCIONAIS = { github: ['rotulo'], jira: ['tipo'], linear: [] };

export function tickets(db, { equipes, conversas, buscar = fetch }) {
  const q = {
    ler: db.prepare('SELECT tickets FROM equipes WHERE id = ?'), gravar: db.prepare('UPDATE equipes SET tickets = ? WHERE id = ?'),
    daSala: db.prepare('SELECT id, tickets FROM equipes WHERE sala = ?'), ativ: db.prepare('SELECT * FROM atividades WHERE id = ?'),
  };
  const admin = (e, u) => { const eq = equipes.ver(e, u); if (!['dono', 'admin'].includes(eq.meuPapel)) throw new ErroUso('Só o dono ou um admin da equipe pode fazer isso.', 403); };
  const publico = (c) => (c ? { tipo: c.tipo_sistema, alvo: c.repo || (c.projeto && `${c.site} · ${c.projeto}`) || (c.time && `time ${c.time}`) } : null);
  return {
    ver(e, u) { equipes.ver(e, u); const t = q.ler.get(e).tickets; return publico(t && JSON.parse(t)); },
    configurar(e, u, cfg) {
      admin(e, u); if (cfg == null || !cfg.tipo) { q.gravar.run(null, e); return null; }
      if (!TIPOS.includes(cfg.tipo)) throw new ErroUso('Sistema de tickets desconhecido: use github, jira ou linear.');
      const c = { tipo_sistema: cfg.tipo };
      for (const k of CAMPOS[cfg.tipo]) { const v = String(cfg[k] || '').trim(); if (!v) throw new ErroUso(`Falta o campo "${k}".`); c[k] = v.slice(0, 500); }
      for (const k of OPCIONAIS[cfg.tipo]) if (cfg[k]) c[k] = String(cfg[k]).trim().slice(0, 100);
      if (c.repo && !/^[\w.-]+\/[\w.-]+$/.test(c.repo)) throw new ErroUso('O repositório vai no formato dono/repo.');
      if (c.site && !/^https:\/\/[\w.-]+/.test(c.site)) throw new ErroUso('O site do Jira começa com https://');
      q.gravar.run(JSON.stringify(c), e); return publico(c);
    },
    // a sala da atividade diz a equipe; sem integração, o front cai no jeito antigo (copiar o texto)
    async abrir(id, u) {
      const a = q.ativ.get(id); if (!a) throw new ErroUso('Atividade não encontrada.', 404); conversas.atividades(a.sala, u);
      if (a.ticket) return a;
      const eq = q.daSala.get(a.sala); if (!eq || !eq.tickets) throw new ErroUso('Esta sala não tem um sistema de tickets ligado. Ligue um na página da equipe.', 409);
      const c = JSON.parse(eq.tickets), url = await SISTEMAS[c.tipo_sistema](c, a, buscar);
      return conversas.marcar(id, u, { ticket: url });
    },
    temIntegracao: (sala) => { const eq = q.daSala.get(sala); return !!(eq && eq.tickets); },
  };
}
