// Incidentes: o prédio pega fogo na cidade e abre uma sala de guerra (conversa + chamada) com o time da cidade.
// Abre por dentro (alguém declara num prédio) ou por fora: POST /api/incidentes/webhook com o token INCIDENTES_TOKEN,
// o que liga Sentry, Datadog, Grafana ou qualquer alerta. Ao resolver, o Claude escreve o post-mortem com a linha do tempo
// (mensagens e falas transcritas da sala).
import { ErroUso } from './contas.mjs';
import { perguntar } from './ia.mjs';
import { timingSafeEqual } from 'node:crypto';

const SEVERIDADES = ['baixa', 'media', 'alta', 'critica'];

export function incidentes(db, { cidades, conversas, equipes, contas, rt, gerar = (pedido) => perguntar(pedido, { maxTokens: 8000 }) }) {
  const q = {
    novo: db.prepare('INSERT INTO incidentes (cidade, predio, titulo, severidade, origem, sala, aberto_por, aberto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    um: db.prepare('SELECT * FROM incidentes WHERE id = ?'),
    abertos: db.prepare('SELECT * FROM incidentes WHERE cidade = ? AND resolvido IS NULL ORDER BY id DESC'),
    recentes: db.prepare('SELECT * FROM incidentes WHERE cidade = ? ORDER BY id DESC LIMIT 20'),
    resolver: db.prepare('UPDATE incidentes SET resolvido = ?, postmortem = ? WHERE id = ?'),
    msgs: db.prepare('SELECT m.texto, m.criada, u.nome FROM mensagens m JOIN usuarios u ON u.id = m.autor WHERE m.sala = ? ORDER BY m.id'),
    falas: db.prepare('SELECT f.texto, f.criada, u.nome FROM falas f JOIN usuarios u ON u.id = f.autor WHERE f.sala = ? ORDER BY f.id'),
    novaMsg: db.prepare('INSERT INTO mensagens (sala, autor, texto, criada) VALUES (?, ?, ?, ?)'),
  };
  // quem é avisado: a equipe da cidade, ou só quem é dono dela
  const timeDa = (c) => (c.equipe ? equipes.membrosDe(c.equipe) : [c.dono]);
  const avisar = (inc, membros) => { for (const m of membros) rt.para(m, { t: 'incidente', incidente: inc }); };

  function abrir(cidadeSlug, autor, { predio, titulo, severidade, origem }) {
    const c = db.prepare('SELECT * FROM cidades WHERE slug = ?').get(cidadeSlug); if (!c) throw new ErroUso('Cidade não encontrada.', 404);
    const def = JSON.parse(c.definicao), ids = new Set([...def.bairros.flatMap(b => [...b.estacoes, ...(b.desvios || [])].map(e => e.id)), ...def.externos.map(e => e.id)]);
    if (!ids.has(String(predio))) throw new ErroUso('Esse prédio não existe nesta cidade.');
    titulo = String(titulo || '').trim().slice(0, 120) || 'Incidente'; severidade = SEVERIDADES.includes(severidade) ? severidade : 'alta';
    const membros = timeDa(c), dono = autor || c.dono, nomePredio = [...def.bairros.flatMap(b => [...b.estacoes, ...(b.desvios || [])]), ...def.externos].find(e => e.id === predio).nome;
    const sala = conversas.criarGrupo(dono, { nome: `🔥 ${titulo}`, membros });
    const agora = Date.now(), { lastInsertRowid } = q.novo.run(cidadeSlug, String(predio), titulo, severidade, String(origem || 'manual').slice(0, 60), sala, autor || null, agora);
    q.novaMsg.run(sala, dono, `Incidente aberto em **${nomePredio}** (severidade ${severidade})${origem && origem !== 'manual' ? ` pelo alerta de ${origem}` : ''}. Usem esta sala e a chamada dela até resolver.`, agora);
    const inc = q.um.get(Number(lastInsertRowid)); avisar({ ...inc, predioNome: nomePredio }, membros);
    for (const m of membros) rt.para(m, { t: 'sala', sala: conversas.sala(sala, m) });
    return inc;
  }

  return {
    abertos(slug, u) { cidades.ver(slug, u); return q.abertos.all(slug); },
    recentes(slug, u) { cidades.ver(slug, u); return q.recentes.all(slug); },
    declarar(slug, u, corpo) { cidades.ver(slug, u); return abrir(slug, u, { ...corpo, origem: 'manual' }); },
    // alerta do próprio servidor (o monitor da hospedagem): sem autor, origem 'monitor'
    automatico(slug, corpo) { return abrir(slug, null, { ...corpo, origem: 'monitor' }); },
    // alerta externo: token compartilhado no cabeçalho x-systemcity-token
    webhook(token, corpo) {
      const certo = process.env.INCIDENTES_TOKEN; if (!certo) throw new ErroUso('Webhook de incidentes desligado: defina INCIDENTES_TOKEN no servidor.', 503);
      const a = Buffer.from(String(token || '')), b = Buffer.from(certo); if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ErroUso('Token inválido.', 401);
      return abrir(String(corpo.cidade || ''), null, corpo);
    },
    async resolver(id, u) {
      const inc = q.um.get(Number(id)); if (!inc) throw new ErroUso('Incidente não encontrado.', 404); if (!conversas.ehMembro(inc.sala, u)) throw new ErroUso('Você não está na sala deste incidente.', 403);
      if (inc.resolvido) throw new ErroUso('Este incidente já foi resolvido.', 409);
      const fim = Date.now(), linha = [...q.msgs.all(inc.sala).map(m => ({ ...m, tipo: 'chat' })), ...q.falas.all(inc.sala).map(f => ({ ...f, tipo: 'fala' }))].sort((a, b) => a.criada - b.criada)
        .map(x => `[${new Date(x.criada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}] ${x.nome}${x.tipo === 'fala' ? ' (na chamada)' : ''}: ${x.texto}`).join('\n');
      const duracao = Math.round((fim - inc.aberto) / 60000), cid = db.prepare('SELECT * FROM cidades WHERE slug = ?').get(inc.cidade), bairrosDef = cid ? JSON.parse(cid.definicao).bairros : [];
      let pm;
      try { pm = await gerar(`Escreva o post-mortem de um incidente, em português, SOMENTE em markdown, sem texto antes ou depois. Use só o que está na linha do tempo; não invente causa, impacto nem ações. Onde faltar informação, escreva "não registrado".

# Post-mortem: ${inc.titulo}
_Severidade ${inc.severidade} · aberto ${new Date(inc.aberto).toLocaleString('pt-BR')} · resolvido em ${duracao} min · origem: ${inc.origem}_

## Resumo
## Linha do tempo
(lista com horário e o que aconteceu)
## Causa
## Impacto
## O que resolveu
## Ações para não repetir
(lista no formato "- [ ] **Ação** — responsável: Nome ou "a definir" — prazo: data ou "a definir" — bairro: id do bairro que a ação afeta ou "nenhum"")

Bairros da cidade (id — nome): ${bairrosDef.map(b => `${b.id} — ${b.nome}`).join(' · ')}
O incidente foi no prédio "${inc.predio}".

Linha do tempo bruta (conversa e falas transcritas da sala de guerra):
${linha || '(a sala ficou vazia)'}`); }
      catch (e) { pm = `# Post-mortem: ${inc.titulo}\n\nO Claude não conseguiu escrever o post-mortem (${e.message}). Linha do tempo:\n\n${linha}`; }
      q.resolver.run(fim, pm, inc.id);
      const ata = conversas.salvarAta(inc.sala, u, { titulo: `Post-mortem: ${inc.titulo}`, markdown: pm, de: 0, ate: 0 });
      const bairros = bairrosDef.length ? bairrosDef.map(b => b.id) : null;
      conversas.guardarAtividades(ata, inc.sala, pm.replace(/^## Ações para não repetir/m, '## Atividades'), bairros);
      const pronto = q.um.get(inc.id); avisar(pronto, conversas.membrosDe(inc.sala)); rt.paraSala(inc.sala, { t: 'ata', ata: { ...conversas.ata(ata, u), markdown: undefined } });
      return pronto;
    },
  };
}
