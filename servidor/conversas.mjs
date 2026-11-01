// Salas, mensagens e reuniões. Toda leitura e escrita confere se quem pede é membro da sala.
import { ErroUso } from './contas.mjs';

const MAX_TEXTO = 4000, POR_PAGINA = 50;

export function conversas(db) {
  const q = {
    pessoas: db.prepare('SELECT id, nome, nick, email FROM usuarios ORDER BY nome'),
    existe: db.prepare('SELECT id FROM usuarios WHERE id = ?'),
    membro: db.prepare('SELECT 1 FROM membros WHERE sala = ? AND usuario = ?'),
    membrosDe: db.prepare('SELECT usuario FROM membros WHERE sala = ?'),
    sala: db.prepare('SELECT * FROM salas WHERE id = ?'),
    salaPorChave: db.prepare('SELECT * FROM salas WHERE chave = ?'),
    novaSala: db.prepare('INSERT INTO salas (nome, tipo, chave, criada_por, criada) VALUES (?, ?, ?, ?, ?)'),
    entrar: db.prepare('INSERT OR IGNORE INTO membros (sala, usuario) VALUES (?, ?)'),
    sair: db.prepare('DELETE FROM membros WHERE sala = ? AND usuario = ?'),
    minhas: db.prepare(`SELECT s.id, s.nome, s.tipo, m.lida_ate,
        (SELECT json_object('id', x.id, 'autor', x.autor, 'texto', x.texto, 'criada', x.criada) FROM mensagens x WHERE x.sala = s.id ORDER BY x.id DESC LIMIT 1) AS ultima,
        (SELECT count(*) FROM mensagens x WHERE x.sala = s.id AND x.id > m.lida_ate AND x.autor != m.usuario) AS novas,
        (SELECT json_group_array(u.id) FROM membros mm JOIN usuarios u ON u.id = mm.usuario WHERE mm.sala = s.id) AS membros
      FROM salas s JOIN membros m ON m.sala = s.id WHERE m.usuario = ? ORDER BY coalesce((SELECT max(id) FROM mensagens WHERE sala = s.id), 0) DESC, s.id DESC`),
    mensagens: db.prepare('SELECT id, sala, autor, texto, criada FROM mensagens WHERE sala = ? AND id < ? ORDER BY id DESC LIMIT ?'),
    novaMsg: db.prepare('INSERT INTO mensagens (sala, autor, texto, criada) VALUES (?, ?, ?, ?)'),
    lida: db.prepare('UPDATE membros SET lida_ate = max(lida_ate, ?) WHERE sala = ? AND usuario = ?'),
    novaReuniao: db.prepare('INSERT INTO reunioes (titulo, descricao, inicio, fim, sala, criada_por, criada) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    convidar: db.prepare('INSERT OR IGNORE INTO convidados (reuniao, usuario, resposta) VALUES (?, ?, ?)'),
    reuniao: db.prepare('SELECT * FROM reunioes WHERE id = ?'),
    minhasReunioes: db.prepare(`SELECT r.*, c.resposta AS minha_resposta,
        (SELECT json_group_array(json_object('usuario', cc.usuario, 'resposta', cc.resposta)) FROM convidados cc WHERE cc.reuniao = r.id) AS convidados
      FROM reunioes r JOIN convidados c ON c.reuniao = r.id WHERE c.usuario = ? AND r.fim >= ? ORDER BY r.inicio`),
    responder: db.prepare('UPDATE convidados SET resposta = ? WHERE reuniao = ? AND usuario = ?'),
    novaFala: db.prepare('INSERT INTO falas (sala, autor, texto, criada) VALUES (?, ?, ?, ?)'),
    falas: db.prepare('SELECT f.id, f.autor, u.nome, f.texto, f.criada FROM falas f JOIN usuarios u ON u.id = f.autor WHERE f.sala = ? AND f.id > ? ORDER BY f.id'),
    ultimaAta: db.prepare('SELECT coalesce(max(ate), 0) AS ate FROM atas WHERE sala = ?'),
    novaAta: db.prepare('INSERT INTO atas (sala, titulo, markdown, de, ate, criada_por, criada) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    atas: db.prepare('SELECT id, sala, titulo, de, ate, criada_por, criada FROM atas WHERE sala = ? ORDER BY id DESC'),
    ata: db.prepare('SELECT * FROM atas WHERE id = ?'),
    reuniaoDaSala: db.prepare('SELECT * FROM reunioes WHERE sala = ?'),
    novaAtiv: db.prepare('INSERT INTO atividades (ata, sala, titulo, descricao, responsavel, prazo, bairro, criada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    ativsDaSala: db.prepare('SELECT * FROM atividades WHERE sala = ? ORDER BY feita, id DESC'),
    ativsDaAta: db.prepare('SELECT * FROM atividades WHERE ata = ? ORDER BY id'),
    ativ: db.prepare('SELECT * FROM atividades WHERE id = ?'),
    marcarAtiv: db.prepare('UPDATE atividades SET feita = ?, feita_em = ?, ticket = coalesce(?, ticket) WHERE id = ?'),
    obras: db.prepare(`SELECT a.*, s.nome AS sala_nome, s.tipo AS sala_tipo FROM atividades a JOIN salas s ON s.id = a.sala JOIN membros m ON m.sala = a.sala AND m.usuario = ?
      WHERE a.feita = 0 AND a.bairro IS NOT NULL ORDER BY a.id DESC LIMIT 60`),
  };
  const ehMembro = (sala, u) => !!q.membro.get(sala, u);
  const exigeMembro = (sala, u) => { if (!q.sala.get(sala)) throw new ErroUso('Sala não encontrada.', 404); if (!ehMembro(sala, u)) throw new ErroUso('Você não está nesta sala.', 403); };
  const ids = (lista) => [...new Set((Array.isArray(lista) ? lista : []).map(Number).filter(n => Number.isInteger(n) && q.existe.get(n)))];
  const salaDe = (row) => ({ ...row, ultima: row.ultima ? JSON.parse(row.ultima) : null, membros: JSON.parse(row.membros) });
  const reuniaoDe = (r) => ({ ...r, convidados: JSON.parse(r.convidados) });

  return {
    ehMembro, membrosDe: (sala) => q.membrosDe.all(sala).map(r => r.usuario),
    pessoas: () => q.pessoas.all(),
    salas: (u) => q.minhas.all(u).map(salaDe),
    sala(id, u) { exigeMembro(id, u); return salaDe(q.minhas.all(u).find(s => s.id === id)); },

    criarGrupo(u, { nome, membros }) {
      nome = String(nome || '').trim(); if (!nome || nome.length > 80) throw new ErroUso('Dê um nome de até 80 letras ao grupo.');
      const { lastInsertRowid } = q.novaSala.run(nome, 'grupo', null, u, Date.now()), id = Number(lastInsertRowid);
      for (const m of [u, ...ids(membros)]) q.entrar.run(id, m);
      return id;
    },
    sairDaSala(sala, u) { q.sair.run(sala, u); },
    entrarNaSala(sala, u) { if (!q.sala.get(sala)) throw new ErroUso('Sala não encontrada.', 404); q.entrar.run(sala, u); },
    direta(u, com) {   // a conversa entre duas pessoas é sempre a mesma: a chave é o par de ids em ordem
      com = Number(com); if (!q.existe.get(com) || com === u) throw new ErroUso('Pessoa inválida.');
      const chave = `d:${Math.min(u, com)}:${Math.max(u, com)}`, achada = q.salaPorChave.get(chave); if (achada) return achada.id;
      const { lastInsertRowid } = q.novaSala.run('direta', 'direta', chave, u, Date.now()), id = Number(lastInsertRowid);
      q.entrar.run(id, u); q.entrar.run(id, com); return id;
    },

    mensagens(sala, u, antes) { exigeMembro(sala, u); return q.mensagens.all(sala, Number(antes) || Number.MAX_SAFE_INTEGER, POR_PAGINA).reverse(); },
    enviar(sala, u, texto) {
      exigeMembro(sala, u); texto = String(texto || '').trim();
      if (!texto) throw new ErroUso('Mensagem vazia.'); if (texto.length > MAX_TEXTO) throw new ErroUso(`Mensagem com mais de ${MAX_TEXTO} caracteres.`);
      const criada = Date.now(), { lastInsertRowid } = q.novaMsg.run(sala, u, texto, criada), id = Number(lastInsertRowid);
      q.lida.run(id, sala, u); return { id, sala, autor: u, texto, criada };
    },
    marcarLida(sala, u, ate) { exigeMembro(sala, u); q.lida.run(Number(ate) || 0, sala, u); },

    agendar(u, { titulo, descricao, inicio, fim, convidados }) {
      titulo = String(titulo || '').trim(); inicio = Number(new Date(inicio)); fim = Number(new Date(fim));
      if (!titulo || titulo.length > 120) throw new ErroUso('Dê um título de até 120 letras à reunião.');
      if (!inicio || !fim || fim <= inicio) throw new ErroUso('O fim precisa ser depois do início.');
      const agora = Date.now(), { lastInsertRowid: sid } = q.novaSala.run(titulo, 'reuniao', null, u, agora), sala = Number(sid);
      const { lastInsertRowid: rid } = q.novaReuniao.run(titulo, String(descricao || '').slice(0, 2000), inicio, fim, sala, u, agora), id = Number(rid);
      for (const m of [u, ...ids(convidados)]) { q.entrar.run(sala, m); q.convidar.run(id, m, m === u ? 'sim' : 'pendente'); }
      return id;
    },
    reunioes: (u) => q.minhasReunioes.all(u, Date.now() - 3600e3).map(reuniaoDe),
    reuniao(id, u) { const r = q.minhasReunioes.all(u, 0).find(x => x.id === id); if (!r) throw new ErroUso('Reunião não encontrada.', 404); return reuniaoDe(r); },
    responder(id, u, resposta) {
      if (!['sim', 'nao', 'talvez'].includes(resposta)) throw new ErroUso('Resposta inválida.');
      if (!q.responder.run(resposta, id, u).changes) throw new ErroUso('Você não foi convidado para essa reunião.', 404);
    },
    falar(sala, u, texto) {
      exigeMembro(sala, u); texto = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 1000); if (!texto) return null;
      const criada = Date.now(), { lastInsertRowid } = q.novaFala.run(sala, u, texto, criada); return { id: Number(lastInsertRowid), sala, autor: u, texto, criada };
    },
    // o trecho ainda sem ata: as falas depois da última ata desta sala
    trechoSemAta(sala, u) { exigeMembro(sala, u); return q.falas.all(sala, q.ultimaAta.get(sala).ate); },
    salvarAta(sala, u, { titulo, markdown, de, ate }) { exigeMembro(sala, u);
      const { lastInsertRowid } = q.novaAta.run(sala, titulo, markdown, de, ate, u, Date.now()); return Number(lastInsertRowid); },
    atas(sala, u) { exigeMembro(sala, u); return q.atas.all(sala); },
    ata(id, u) { const a = q.ata.get(id); if (!a) throw new ErroUso('Ata não encontrada.', 404); exigeMembro(a.sala, u); return a; },
    // as atividades de uma ata, tiradas do markdown: "- [ ] **Título** — responsável: X — prazo: Y — bairro: Z" e a linha de descrição abaixo
    guardarAtividades(ataId, sala, markdown, bairrosValidos = null) {
      const secao = (markdown.split(/^## Atividades\s*$/m)[1] || '').split(/^## /m)[0], linhas = secao.split('\n'), achadas = [];
      for (let i = 0; i < linhas.length; i++) {
        const m = linhas[i].match(/^\s*-\s*\[[ xX]?\]\s*\*\*(.+?)\*\*\s*(.*)$/); if (!m) continue;
        const resto = m[2], campo = (nome) => (resto.match(new RegExp(`${nome}\\s*:\\s*([^—–\\-]+?)(?=\\s+[—–-]\\s+\\w+\\s*:|$)`, 'i')) || [])[1]?.trim() || null;
        let descricao = ''; for (let j = i + 1; j < linhas.length && /^\s{2,}\S/.test(linhas[j]); j++) descricao += (descricao ? ' ' : '') + linhas[j].trim();
        let bairro = campo('bairro'); if (bairro && (/^nenhum/i.test(bairro) || (bairrosValidos && !bairrosValidos.includes(bairro)))) bairro = null;
        const r = q.novaAtiv.run(ataId, sala, m[1].trim().slice(0, 160), descricao.slice(0, 1000), campo('respons[aá]vel'), campo('prazo'), bairro, Date.now());
        achadas.push(q.ativ.get(Number(r.lastInsertRowid)));
      }
      return achadas;
    },
    atividades(sala, u) { exigeMembro(sala, u); return q.ativsDaSala.all(sala); },
    atividadesDaAta(ataId, u) { const a = q.ata.get(ataId); if (!a) throw new ErroUso('Ata não encontrada.', 404); exigeMembro(a.sala, u); return q.ativsDaAta.all(ataId); },
    marcar(id, u, { feita, ticket }) { const a = q.ativ.get(id); if (!a) throw new ErroUso('Atividade não encontrada.', 404); exigeMembro(a.sala, u);
      const f = feita == null ? a.feita : feita ? 1 : 0; q.marcarAtiv.run(f, f && !a.feita ? Date.now() : f ? a.feita_em : null, ticket != null ? String(ticket).slice(0, 500) : null, id); return q.ativ.get(id); },
    obras(u, bairros) { const lista = q.obras.all(u); return bairros ? lista.filter(a => bairros.includes(a.bairro)) : lista; },
    contexto(sala) { const s = q.sala.get(sala), r = q.reuniaoDaSala.get(sala); return { sala: s, reuniao: r || null }; },
    convidadosDe: (id) => { const r = q.reuniao.get(id); return r ? q.membrosDe.all(r.sala).map(x => x.usuario) : []; },
  };
}
