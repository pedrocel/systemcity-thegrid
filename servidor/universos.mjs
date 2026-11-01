// Universos: vários repositórios lado a lado. Cada repositório é uma cidade gerada do GitHub (cidades.mjs); o universo junta
// todas num mapa só (cada uma numa região, com um marco com o nome do repositório) e o Claude desenha as ligações entre elas:
// o front que chama a API, o worker que lê a fila do outro serviço, a lib compartilhada…
// Abre em cidade.html?u=<slug>.
import { nomeDoRepo, separarFonte } from './fontes.mjs';
import { ErroUso } from './contas.mjs';
import { perguntar } from './ia.mjs';

const slugDe = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'universo';
const MAX_REPOS = 12, CORES_LIGACAO = 0xf472b6;

export function universos(db, { cidades, equipes }) {
  const q = {
    novo: db.prepare('INSERT INTO universos (slug, nome, dono, equipe, ligacoes, criado) VALUES (?, ?, ?, ?, ?, ?)'),
    porSlug: db.prepare('SELECT * FROM universos WHERE slug = ?'),
    meus: db.prepare(`SELECT u.*, (SELECT count(*) FROM cidades c WHERE c.universo = u.id) AS repos FROM universos u
      WHERE u.dono = ? OR u.equipe IN (SELECT equipe FROM equipe_membros WHERE usuario = ?) ORDER BY u.id DESC`),
    cidadesDe: db.prepare('SELECT * FROM cidades WHERE universo = ? ORDER BY id'),
    ligar: db.prepare('UPDATE cidades SET universo = ? WHERE id = ?'),
    ligacoes: db.prepare('UPDATE universos SET ligacoes = ? WHERE id = ?'),
    apagar: db.prepare('DELETE FROM universos WHERE id = ?'),
  };
  const podeVer = (un, u) => un.dono === u || (un.equipe && equipes.membrosDe(un.equipe).includes(u));
  const ver = (slug, u) => { const un = q.porSlug.get(slug); if (!un || !podeVer(un, u)) throw new ErroUso('Universo não encontrado.', 404); return un; };
  const slugLivre = (base) => { let s = slugDe(base), k = 1; while (q.porSlug.get(s)) s = `${slugDe(base).slice(0, 36)}-${++k}`; return s; };

  // o mapa único: cada cidade numa faixa, uma depois da outra, com os ids prefixados pelo índice do repositório
  function compor(un) {
    const lista = q.cidadesDe.all(un.id).map(c => ({ ...c, def: JSON.parse(c.definicao), catalogo: c.catalogo ? JSON.parse(c.catalogo) : null, textos: c.textos ? JSON.parse(c.textos) : null }));
    const M = { titulo: un.nome, bairros: [], externos: [], rotas: {}, ambiente: [], recortes: {} }, catalogo = { geradoEm: new Date().toISOString(), repos: [], bairros: {} }, textos = {}, mapaIds = {};
    let x = 0;
    lista.forEach((c, k) => {
      const p = `r${k}-`, d = c.def, xs = d.bairros.map(b => b.grade[0]).concat(d.externos.map(e => e.q[0])), x0 = Math.min(...xs), largura = Math.max(...d.bairros.map(b => b.grade[0] + b.grade[2]), ...d.externos.map(e => e.q[0] + 1)) - x0;
      const dx = x - x0, repo = nomeDoRepo(c.fonte); mapaIds[repo] = { prefixo: p, bairros: d.bairros.map(b => ({ id: p + b.id, nome: b.nome, pastas: b.pastas || [] })) };
      for (const b of d.bairros) M.bairros.push({ ...b, id: p + b.id, nome: b.nome, sub: `${repo.split('/').pop()} · ${b.sub || ''}`.replace(/ · $/, ''), grade: [b.grade[0] + dx, b.grade[1], b.grade[2], b.grade[3]], foco: k === 0 && b.foco,
        estacoes: b.estacoes.map(e => ({ ...e, id: p + e.id, ...(e.chama ? { chama: e.chama.map(r => p + r) } : {}) })), desvios: (b.desvios || []).map(dv => ({ ...dv, id: p + dv.id, de: p + dv.de, volta: p + dv.volta })) });
      for (const e of d.externos) M.externos.push({ ...e, id: p + e.id, q: [e.q[0] + dx, e.q[1]] });
      // o marco do repositório: um prédio alto na entrada da região, com o nome dele
      M.externos.push({ id: `${p}marco`, nome: repo.split('/').pop(), subn: repo, q: [x0 + dx, -6], f: [10, 10], h: 26, entra: '—', sai: '—', desc: `Repositório ${repo}. ${d.resumo || ''}` });
      for (const [rid, r] of Object.entries(d.rotas)) M.rotas[p + rid] = { ...r, de: p + r.de, para: p + r.para };
      for (const a of d.ambiente || []) M.ambiente.push({ ...a, rota: p + a.rota });
      for (const [bid, l] of Object.entries((c.catalogo || {}).bairros || {})) catalogo.bairros[p + bid] = l.map(s => ({ ...s, bairro: p + bid }));
      for (const [bid, t] of Object.entries(c.textos || {})) textos[p + bid] = t;
      catalogo.repos.push(...((c.catalogo || {}).repos || []));
      x += largura + 4;
    });
    // ligações entre repositórios: da primeira estação do bairro de origem até a primeira do de destino
    for (const [i, l] of (JSON.parse(un.ligacoes || '[]')).entries()) {
      const de = M.bairros.find(b => b.id === l.de), para = M.bairros.find(b => b.id === l.para) || M.externos.find(e => e.id === l.para); if (!de || !para) continue;
      const rid = `lig${i}`; M.rotas[rid] = { de: de.estacoes[de.estacoes.length - 1].id, para: para.estacoes ? para.estacoes[0].id : para.id, cor: CORES_LIGACAO };
      M.ambiente.push({ rota: rid, cada: 4, volta: CORES_LIGACAO }); de.ligacoes = [...(de.ligacoes || []), `${l.tipo || 'chama'} ${para.nome}: ${l.desc || ''}`];
    }
    return { M, catalogo, textos, mapaIds, cidades: lista };
  }

  async function desenharLigacoes(un) {
    const lista = q.cidadesDe.all(un.id); if (lista.length < 2) { q.ligacoes.run('[]', un.id); return []; }
    const resumo = lista.map((c, k) => { const d = JSON.parse(c.definicao); return `## Repositório ${nomeDoRepo(c.fonte)} (prefixo r${k}-)\n${d.resumo || ''}\nBairros: ${d.bairros.map(b => `r${k}-${b.id} (${b.nome}: ${b.desc || b.sub || ''})`).join('; ')}\nSistemas de fora que ele usa: ${d.externos.map(e => `${e.nome}${e.subn ? ' / ' + e.subn : ''}: ${e.desc || ''}`).join('; ') || 'nenhum'}`; }).join('\n\n');
    const r = await perguntar(`Estes repositórios formam um mesmo sistema. Diga como eles se ligam: quem chama a API de quem, quem lê a fila ou o banco do outro, quem importa a biblioteca de quem. Use só o que as descrições sustentam; na dúvida, deixe de fora.

Responda SOMENTE com JSON: { "ligacoes": [ { "de": "id do bairro que chama (com prefixo)", "para": "id do bairro chamado (com prefixo)", "tipo": "chama | publica | lê | importa", "desc": "uma frase" } ] }
No máximo 12 ligações, nunca dentro do mesmo repositório.

${resumo}`, { json: true, maxTokens: 6000 });
    const ids = new Set(lista.flatMap((c, k) => JSON.parse(c.definicao).bairros.map(b => `r${k}-${b.id}`)));
    const ligs = (r.ligacoes || []).filter(l => ids.has(l.de) && ids.has(l.para) && l.de.split('-')[0] !== l.para.split('-')[0]).slice(0, 12).map(l => ({ de: l.de, para: l.para, tipo: String(l.tipo || 'chama').slice(0, 20), desc: String(l.desc || '').slice(0, 200) }));
    q.ligacoes.run(JSON.stringify(ligs), un.id); return ligs;
  }

  return {
    meus: (u) => q.meus.all(u, u),
    ver: (slug, u) => { const un = ver(slug, u); return { ...un, ligacoes: JSON.parse(un.ligacoes || '[]'), repos: q.cidadesDe.all(un.id).map(c => ({ slug: c.slug, nome: c.nome, repo: nomeDoRepo(c.fonte), provedor: c.fonte.split(':')[0] })) }; },
    compor: (slug, u) => compor(ver(slug, u)),
    criar(u, { nome, equipe }) {
      nome = String(nome || '').trim().slice(0, 60) || 'Meu universo'; if (equipe && !equipes.membrosDe(equipe).includes(u)) throw new ErroUso('Você não está nessa equipe.', 403);
      const slug = slugLivre(nome), { lastInsertRowid } = q.novo.run(slug, nome, u, equipe || null, '[]', Date.now()); return { id: Number(lastInsertRowid), slug, nome };
    },
    // gera a cidade do repositório (ou aproveita uma que a pessoa já tenha) e põe no universo; depois redesenha as ligações
    async adicionarRepo(slug, u, { repo, fonte: f }) {
      const un = ver(slug, u); if (q.cidadesDe.all(un.id).length >= MAX_REPOS) throw new ErroUso(`Um universo tem até ${MAX_REPOS} repositórios.`);
      const sf = separarFonte(f || repo), fonte = `${sf.provedor}:${sf.repo}`;   // GitHub, Bitbucket ou CodeCommit, juntos no mesmo universo
      let c = db.prepare('SELECT * FROM cidades WHERE dono = ? AND fonte = ? ORDER BY id DESC').get(u, fonte);
      if (!c) { const nova = await cidades.doRepo(u, { fonte, equipe: un.equipe }); c = db.prepare('SELECT * FROM cidades WHERE id = ?').get(nova.id); }
      q.ligar.run(un.id, c.id); const ligacoes = await desenharLigacoes(un).catch(() => []);
      return { cidade: c.slug, nome: c.nome, ligacoes: ligacoes.length };
    },
    async religar(slug, u) { return desenharLigacoes(ver(slug, u)); },
    tirarRepo(slug, u, cidadeSlug) { const un = ver(slug, u); const c = db.prepare('SELECT * FROM cidades WHERE slug = ? AND universo = ?').get(cidadeSlug, un.id); if (!c) throw new ErroUso('Repositório não está neste universo.', 404); q.ligar.run(null, c.id); },
    apagar(slug, u) { const un = q.porSlug.get(slug); if (!un || un.dono !== u) throw new ErroUso('Só quem criou o universo pode apagá-lo.', 403); db.prepare('UPDATE cidades SET universo = NULL WHERE universo = ?').run(un.id); q.apagar.run(un.id); },
  };
}
