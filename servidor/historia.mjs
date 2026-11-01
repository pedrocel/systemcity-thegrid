// Linha do tempo do projeto, a partir do histórico do git: busca os commits no GitHub (com os arquivos de cada um), guarda no banco
// para não repetir as consultas e liga cada arquivo ao bairro onde ele mora (pelas "pastas" que o Claude mapeou ao gerar a cidade).
// A página toca a história: os bairros nascem no primeiro commit deles e os prédios piscam a cada commit que os toca.
import { ErroUso } from './contas.mjs';

const POR_PAGINA = 100, DETALHES_COM_TOKEN = 300, DETALHES_SEM_TOKEN = 20;

async function gh(caminho, token) {
  const r = await fetch(`https://api.github.com${caminho}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'systemcity', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (r.status === 403 || r.status === 429) throw new ErroUso('O GitHub limitou as consultas. Conecte um token do GitHub ou tente mais tarde.', 429);
  if (!r.ok) throw new ErroUso(`GitHub respondeu ${r.status} ao buscar o histórico.`, 502);
  return r.json();
}

// o bairro de um arquivo: a pasta mapeada mais longa que é prefixo do caminho
export function bairroDoArquivo(caminho, bairros) {
  let melhor = null, tam = -1;
  for (const b of bairros) for (const p of b.pastas || []) if ((caminho === p || caminho.startsWith(p + '/')) && p.length > tam) { melhor = b.id; tam = p.length; }
  return melhor;
}

export function historia(db, { cidades, universos }) {
  const q = {
    tem: db.prepare('SELECT 1 FROM commits WHERE repo = ? AND sha = ?'),
    novo: db.prepare('INSERT OR IGNORE INTO commits (repo, sha, quando, autor, mensagem, arquivos, adicoes, remocoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    doRepo: db.prepare('SELECT * FROM commits WHERE repo = ? ORDER BY quando'),
    token: db.prepare('SELECT github_token FROM usuarios WHERE id = ?'),
  };
  // traz os commits novos (os que ainda não estão no banco), do mais novo para o mais velho, até achar um conhecido
  async function sincronizar(repo, token) {
    const limite = token ? DETALHES_COM_TOKEN : DETALHES_SEM_TOKEN; let detalhados = 0, novos = 0;
    for (let pagina = 1; pagina <= Math.ceil(limite / POR_PAGINA); pagina++) {
      const lista = await gh(`/repos/${repo}/commits?per_page=${POR_PAGINA}&page=${pagina}`, token); if (!lista.length) break;
      for (const c of lista) {
        if (q.tem.get(repo, c.sha)) return novos;   // daqui para trás já está guardado
        let arquivos = [], ad = 0, rm = 0;
        if (detalhados < limite) { const d = await gh(`/repos/${repo}/commits/${c.sha}`, token).catch(() => null); detalhados++;
          if (d) { arquivos = (d.files || []).slice(0, 80).map(f => [f.filename, f.additions, f.deletions]); ad = (d.stats || {}).additions || 0; rm = (d.stats || {}).deletions || 0; } }
        q.novo.run(repo, c.sha, Date.parse(c.commit.author.date), String((c.author && c.author.login) || c.commit.author.name).slice(0, 60), c.commit.message.split('\n')[0].slice(0, 200), JSON.stringify(arquivos), ad, rm); novos++;
      }
      if (lista.length < POR_PAGINA) break;
    }
    return novos;
  }
  const montar = (repo, bairros, prefixo = '') => q.doRepo.all(repo).map(c => { const arquivos = JSON.parse(c.arquivos), porBairro = {};
    for (const [f, a, r] of arquivos) { const b = bairroDoArquivo(f, bairros); const k = b ? prefixo + b : null; if (k) porBairro[k] = (porBairro[k] || 0) + a + r; }
    return { sha: c.sha.slice(0, 7), repo, quando: c.quando, autor: c.autor, mensagem: c.mensagem, adicoes: c.adicoes, remocoes: c.remocoes, arquivos: arquivos.length, bairros: porBairro }; });

  return {
    async daCidade(slug, u) {
      const c = cidades.ver(slug, u); if (!c.fonte.startsWith('github:')) throw new ErroUso('A linha do tempo vem do git: só cidades geradas do GitHub têm uma.');
      const repo = c.fonte.slice(7), token = (q.token.get(c.dono) || {}).github_token || null, novos = await sincronizar(repo, token);
      return { novos, commits: montar(repo, c.definicao.bairros) };
    },
    async doUniverso(slug, u) {
      const { cidades: lista } = universos.compor(slug, u); let novos = 0, commits = [];
      for (const [k, c] of lista.entries()) { const repo = c.fonte.slice(7), token = (q.token.get(c.dono) || {}).github_token || null;
        novos += await sincronizar(repo, token).catch(() => 0); commits = commits.concat(montar(repo, c.def.bairros, `r${k}-`)); }
      commits.sort((a, b) => a.quando - b.quando); return { novos, commits };
    },
  };
}
