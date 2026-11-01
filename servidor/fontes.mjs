// De onde vem o código. O núcleo lê o GitHub; outros provedores (na edição Cloud: Bitbucket e AWS CodeCommit) se registram aqui. Cada adaptador sabe listar os repositórios da conta, dizer a branch
// principal, devolver a árvore de arquivos e o conteúdo de um arquivo. O resto do SystemCity (gerar a cidade, auditar, juntar
// repositórios numa cidade só) só fala com esta interface. A fonte de uma cidade é "<provedor>:<repo>", ex.: "bitbucket:time/api".
import { ErroUso } from './contas.mjs';

export const erroHttp = (quem, r) => {
  if (r.status === 404) return new ErroUso(`Repositório não encontrado no ${quem}. Se for privado, confira se a conexão tem acesso a ele.`, 404);
  if (r.status === 401) return new ErroUso(`O ${quem} recusou a credencial. Conecte de novo.`, 401);
  if (r.status === 403 || r.status === 429) return new ErroUso(`O ${quem} limitou as consultas por agora. Tente em alguns minutos.`, 429);
  return new ErroUso(`${quem} respondeu ${r.status}.`, 502);
};

const github = {
  nome: 'GitHub',
  campos: [['token', 'Token (ghp_… ou github_pat_…)', 'password']],
  validarCred(c) { const t = String(c.token || '').trim(); if (!/^(ghp_|github_pat_|gho_)[A-Za-z0-9_]{20,}$/.test(t)) throw new ErroUso('Isso não parece um token do GitHub (começa com ghp_ ou github_pat_).'); return { token: t }; },
  async pedir(caminho, cred, cru = false) {
    const r = await fetch(`https://api.github.com${caminho}`, { headers: { accept: cru ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'user-agent': 'systemcity', ...(cred && cred.token ? { authorization: `Bearer ${cred.token}` } : {}) } });
    if (!r.ok) throw erroHttp('GitHub', r); return cru ? r.text() : r.json();
  },
  repoDe(entrada) { const m = String(entrada || '').trim().match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/); if (!m) throw new ErroUso('Informe o repositório como dono/nome ou a URL do GitHub.'); return `${m[1]}/${m[2]}`; },
  async conta(cred) { return (await this.pedir('/user', cred)).login; },
  async listar(cred) {
    const l = await this.pedir('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', cred);
    return l.map(r => ({ repo: r.full_name, privado: r.private, descricao: r.description || '', atualizado: Date.parse(r.pushed_at || r.updated_at), linguagem: r.language || '' }));
  },
  async info(repo, cred) { const i = await this.pedir(`/repos/${repo}`, cred); return { branch: i.default_branch || 'main', descricao: i.description || '', linguagem: i.language || '' }; },
  async arvore(repo, branch, cred) { return (await this.pedir(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, cred)).tree.filter(e => e.type === 'blob').map(e => ({ path: e.path, size: e.size || 0 })); },
  conteudo(repo, branch, caminho, cred) { return this.pedir(`/repos/${repo}/contents/${encodeURIComponent(caminho).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, cred, true); },
};

// outros provedores entram por registrarFonte (a edição Cloud registra o Bitbucket e o CodeCommit)
export const FONTES = { github };
export function registrarFonte(id, adaptador) { FONTES[id] = adaptador; }

// "bitbucket:time/api" → { provedor, repo }; sem prefixo (ou URL do GitHub) é GitHub, como sempre foi
export function separarFonte(fonte) {
  const s = String(fonte || '').trim(), m = s.match(/^([a-z]+):(?!\/\/)(.+)$/);
  if (m) { if (!FONTES[m[1]]) throw new ErroUso(`Este servidor não lê repositórios de "${m[1]}".`); return { provedor: m[1], repo: FONTES[m[1]].repoDe(m[2]) }; }
  for (const [id, f] of Object.entries(FONTES)) if (f.reconhece && f.reconhece(s)) return { provedor: id, repo: f.repoDe(s) };   // URL de outro provedor
  return { provedor: 'github', repo: github.repoDe(s) };
}
export const nomeDoRepo = (fonte) => String(fonte).replace(/^[a-z]+:(?!\/\/)/, '');
export const ehRepositorio = (fonte) => { const p = String(fonte || '').split(':')[0]; return p !== 'modelo' && !!FONTES[p]; };

// as credenciais da pessoa: o GitHub mora em usuarios.github_token (o agente e a linha do tempo usam); os outros, na tabela conexoes
export function conexoes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS conexoes (usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, provedor TEXT NOT NULL,
    cred TEXT NOT NULL, conta TEXT, criada INTEGER NOT NULL, PRIMARY KEY (usuario, provedor));`);
  const q = {
    gh: db.prepare('SELECT github_token FROM usuarios WHERE id = ?'), guardarGh: db.prepare('UPDATE usuarios SET github_token = ? WHERE id = ?'),
    uma: db.prepare('SELECT * FROM conexoes WHERE usuario = ? AND provedor = ?'), todas: db.prepare('SELECT provedor, conta, criada FROM conexoes WHERE usuario = ?'),
    guardar: db.prepare('INSERT INTO conexoes (usuario, provedor, cred, conta, criada) VALUES (?, ?, ?, ?, ?) ON CONFLICT (usuario, provedor) DO UPDATE SET cred = excluded.cred, conta = excluded.conta, criada = excluded.criada'),
    tirar: db.prepare('DELETE FROM conexoes WHERE usuario = ? AND provedor = ?'),
  };
  const cred = (u, p) => { if (p === 'github') { const t = (q.gh.get(u) || {}).github_token; return t ? { token: t } : null; } const c = q.uma.get(u, p); return c ? JSON.parse(c.cred) : null; };
  const ex = (p) => { if (!FONTES[p]) throw new ErroUso('Provedor desconhecido: use github, bitbucket ou codecommit.', 404); return FONTES[p]; };
  return {
    cred,
    listar(u) { const outras = Object.fromEntries(q.todas.all(u).map(c => [c.provedor, c]));
      return Object.entries(FONTES).map(([id, f]) => ({ id, nome: f.nome, campos: f.campos.map(([k, rotulo, tipo]) => ({ k, rotulo, tipo: tipo || 'text' })),
        conectado: id === 'github' ? !!cred(u, 'github') : !!outras[id], conta: id === 'github' ? null : (outras[id] || {}).conta || null })); },
    // confere a credencial no provedor antes de guardar: credencial errada não entra
    async conectar(u, p, dados, conferir = true) {
      const f = ex(p), c = f.validarCred(dados || {}), conta = conferir ? await f.conta(c) : null;
      if (p === 'github') q.guardarGh.run(c.token, u); else q.guardar.run(u, p, JSON.stringify(c), conta, Date.now());
      return { id: p, conectado: true, conta };
    },
    desconectar(u, p) { ex(p); if (p === 'github') q.guardarGh.run(null, u); else q.tirar.run(u, p); return { id: p, conectado: false }; },
    // os repositórios de todas as contas ligadas, numa lista só; uma conta com problema não derruba as outras
    async repositorios(u) {
      const saida = [], erros = [];
      await Promise.all(Object.keys(FONTES).map(async p => { const c = cred(u, p); if (!c) return;
        try { for (const r of await FONTES[p].listar(c)) saida.push({ ...r, provedor: p, fonte: `${p}:${r.repo}` }); } catch (e) { erros.push({ provedor: p, erro: e.message }); } }));
      return { repos: saida.sort((a, b) => b.atualizado - a.atualizado), erros };
    },
  };
}
