// De onde vem o código: GitHub, Bitbucket ou AWS CodeCommit. Cada adaptador sabe listar os repositórios da conta, dizer a branch
// principal, devolver a árvore de arquivos e o conteúdo de um arquivo. O resto do SystemCity (gerar a cidade, auditar, juntar
// repositórios numa cidade só) só fala com esta interface. A fonte de uma cidade é "<provedor>:<repo>", ex.: "bitbucket:time/api".
import { ErroUso } from './contas.mjs';

const erroHttp = (quem, r) => {
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

// Bitbucket Cloud: e-mail da conta Atlassian (ou usuário) + API token (ou app password), por Basic auth
const bitbucket = {
  nome: 'Bitbucket',
  campos: [['usuario', 'E-mail da conta Atlassian (ou usuário do Bitbucket)'], ['token', 'API token (ou app password) com leitura de repositórios', 'password']],
  validarCred(c) { const usuario = String(c.usuario || '').trim(), token = String(c.token || '').trim(); if (!usuario || token.length < 10) throw new ErroUso('Informe o usuário (ou e-mail) e o token do Bitbucket.'); return { usuario, token }; },
  async pedir(caminho, cred, cru = false) {
    const url = caminho.startsWith('https://') ? caminho : `https://api.bitbucket.org/2.0${caminho}`;
    const r = await fetch(url, { headers: { authorization: 'Basic ' + Buffer.from(`${cred.usuario}:${cred.token}`).toString('base64'), accept: 'application/json' } });
    if (!r.ok) throw erroHttp('Bitbucket', r); return cru ? r.text() : r.json();
  },
  repoDe(entrada) { const m = String(entrada || '').trim().match(/^(?:https?:\/\/bitbucket\.org\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/); if (!m) throw new ErroUso('Informe o repositório como workspace/nome.'); return `${m[1]}/${m[2]}`; },
  async conta(cred) { const u = await this.pedir('/user', cred); return u.username || u.display_name; },
  async listar(cred) {
    let url = '/repositories?role=member&pagelen=100&sort=-updated_on', l = [];
    for (let i = 0; url && i < 5; i++) { const p = await this.pedir(url, cred); l = l.concat(p.values || []); url = p.next || null; }
    return l.map(r => ({ repo: r.full_name, privado: r.is_private, descricao: r.description || '', atualizado: Date.parse(r.updated_on), linguagem: r.language || '' }));
  },
  async info(repo, cred) { const i = await this.pedir(`/repositories/${repo}`, cred); return { branch: (i.mainbranch || {}).name || 'main', descricao: i.description || '', linguagem: i.language || '' }; },
  async arvore(repo, branch, cred) {
    let url = `/repositories/${repo}/src/${encodeURIComponent(branch)}/?max_depth=20&pagelen=100`, l = [];
    for (let i = 0; url && i < 60 && l.length < 5000; i++) { const p = await this.pedir(url, cred); l = l.concat((p.values || []).filter(v => v.type === 'commit_file')); url = p.next || null; }
    return l.map(v => ({ path: v.path, size: v.size || 0 }));
  },
  conteudo(repo, branch, caminho, cred) { return this.pedir(`/repositories/${repo}/src/${encodeURIComponent(branch)}/${caminho.split('/').map(encodeURIComponent).join('/')}`, cred, true); },
};

// AWS CodeCommit: chave de acesso de um usuário IAM com leitura (codecommit:List*, Get*, BatchGet*) e a região
const codecommit = {
  nome: 'AWS CodeCommit',
  campos: [['regiao', 'Região (ex.: us-east-1)'], ['chave', 'Access key ID'], ['segredo', 'Secret access key', 'password']],
  validarCred(c) { const regiao = String(c.regiao || '').trim(), chave = String(c.chave || '').trim(), segredo = String(c.segredo || '').trim();
    if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(regiao)) throw new ErroUso('Região inválida (ex.: us-east-1).'); if (!/^(AKIA|ASIA)[A-Z0-9]{12,}$/.test(chave) || segredo.length < 20) throw new ErroUso('Confira a access key e a secret key.'); return { regiao, chave, segredo }; },
  async cliente(cred) { const sdk = await import('@aws-sdk/client-codecommit');
    return { sdk, c: new sdk.CodeCommitClient({ region: cred.regiao, credentials: { accessKeyId: cred.chave, secretAccessKey: cred.segredo } }) }; },
  async enviar(cred, Comando, entrada) { const { sdk, c } = await this.cliente(cred);
    try { return await c.send(new sdk[Comando](entrada)); }
    catch (e) { const n = e.name || ''; if (/RepositoryDoesNotExist|FileDoesNotExist|FolderDoesNotExist/.test(n)) throw new ErroUso('Repositório não encontrado no CodeCommit.', 404);
      if (/UnrecognizedClient|InvalidSignature|AccessDenied|ExpiredToken/.test(n)) throw new ErroUso(`A AWS recusou a credencial (${n}).`, 401); throw new ErroUso(`CodeCommit: ${e.message}`, 502); } },
  repoDe(entrada) { const m = String(entrada || '').trim().match(/([\w.-]+)$/); if (!m) throw new ErroUso('Informe o nome do repositório do CodeCommit.'); return m[1]; },
  async conta(cred) { await this.enviar(cred, 'ListRepositoriesCommand', {}); return `${cred.chave.slice(0, 8)}… · ${cred.regiao}`; },
  async listar(cred) {
    let token, nomes = []; do { const r = await this.enviar(cred, 'ListRepositoriesCommand', { nextToken: token }); nomes = nomes.concat((r.repositories || []).map(x => x.repositoryName)); token = r.nextToken; } while (token && nomes.length < 500);
    const det = []; for (let i = 0; i < nomes.length; i += 25) { const r = await this.enviar(cred, 'BatchGetRepositoriesCommand', { repositoryNames: nomes.slice(i, i + 25) }); det.push(...(r.repositories || [])); }
    return det.map(r => ({ repo: r.repositoryName, privado: true, descricao: r.repositoryDescription || '', atualizado: r.lastModifiedDate ? new Date(r.lastModifiedDate).getTime() : 0, linguagem: '' })).sort((a, b) => b.atualizado - a.atualizado);
  },
  async info(repo, cred) { const r = (await this.enviar(cred, 'GetRepositoryCommand', { repositoryName: repo })).repositoryMetadata; return { branch: r.defaultBranch || 'main', descricao: r.repositoryDescription || '', linguagem: '' }; },
  async arvore(repo, branch, cred) {   // o CodeCommit lista pasta por pasta: anda em largura até um teto
    const commit = (await this.enviar(cred, 'GetBranchCommand', { repositoryName: repo, branchName: branch })).branch.commitId, l = [], fila = ['/'];
    while (fila.length && l.length < 4000) { const pasta = fila.shift(), r = await this.enviar(cred, 'GetFolderCommand', { repositoryName: repo, commitSpecifier: commit, folderPath: pasta });
      for (const f of r.files || []) l.push({ path: f.absolutePath, size: 0 }); for (const s of r.subFolders || []) if (!/(^|\/)(node_modules|vendor|dist|build|\.git)$/.test(s.absolutePath)) fila.push(s.absolutePath); }
    return l;
  },
  async conteudo(repo, branch, caminho, cred) { const r = await this.enviar(cred, 'GetFileCommand', { repositoryName: repo, commitSpecifier: branch, filePath: caminho }); return Buffer.from(r.fileContent).toString('utf8'); },
};

export const FONTES = { github, bitbucket, codecommit };
export const PREFIXO_URL = { github: 'https://github.com/', bitbucket: 'https://bitbucket.org/' };

// "bitbucket:time/api" → { provedor, repo }; sem prefixo (ou URL do GitHub) é GitHub, como sempre foi
export function separarFonte(fonte) {
  const s = String(fonte || '').trim(), m = s.match(/^(github|bitbucket|codecommit):(.+)$/);
  if (m) return { provedor: m[1], repo: FONTES[m[1]].repoDe(m[2]) };
  if (/^https?:\/\/bitbucket\.org\//.test(s)) return { provedor: 'bitbucket', repo: bitbucket.repoDe(s) };
  return { provedor: 'github', repo: github.repoDe(s) };
}
export const nomeDoRepo = (fonte) => String(fonte).replace(/^(github|bitbucket|codecommit):/, '');
export const ehRepositorio = (fonte) => /^(github|bitbucket|codecommit):/.test(String(fonte || ''));

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
