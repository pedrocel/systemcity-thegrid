// Equipes: um grupo de pessoas com dono, admins e membros, e uma sala de conversa própria (chat, chamada, atas).
// Só dono e admins adicionam ou tiram gente; qualquer membro pode sair; o dono não sai sem passar a equipe adiante.
import { ErroUso } from './contas.mjs';

export function equipes(db, { contas, conversas }) {
  const q = {
    nova: db.prepare('INSERT INTO equipes (nome, sala, dono, criada) VALUES (?, ?, ?, ?)'),
    equipe: db.prepare('SELECT * FROM equipes WHERE id = ?'),
    papel: db.prepare('SELECT papel FROM equipe_membros WHERE equipe = ? AND usuario = ?'),
    entrar: db.prepare('INSERT INTO equipe_membros (equipe, usuario, papel, entrou) VALUES (?, ?, ?, ?)'),
    sair: db.prepare('DELETE FROM equipe_membros WHERE equipe = ? AND usuario = ?'),
    mudarPapel: db.prepare('UPDATE equipe_membros SET papel = ? WHERE equipe = ? AND usuario = ?'),
    mudarDono: db.prepare('UPDATE equipes SET dono = ? WHERE id = ?'),
    renomear: db.prepare('UPDATE equipes SET nome = ? WHERE id = ?'),
    apagar: db.prepare('DELETE FROM equipes WHERE id = ?'),
    minhas: db.prepare(`SELECT e.id, e.nome, e.sala, e.dono, m.papel, (SELECT count(*) FROM equipe_membros x WHERE x.equipe = e.id) AS n
      FROM equipes e JOIN equipe_membros m ON m.equipe = e.id WHERE m.usuario = ? ORDER BY e.nome`),
    membros: db.prepare(`SELECT u.id, u.nome, u.nick, m.papel, m.entrou FROM equipe_membros m JOIN usuarios u ON u.id = m.usuario
      WHERE m.equipe = ? ORDER BY m.papel = 'dono' DESC, m.papel = 'admin' DESC, u.nome`),
  };
  const papelDe = (e, u) => (q.papel.get(e, u) || {}).papel || null;
  const exige = (e, u, ...papeis) => { const eq = q.equipe.get(e); if (!eq) throw new ErroUso('Equipe não encontrada.', 404);
    const p = papelDe(e, u); if (!p) throw new ErroUso('Você não está nesta equipe.', 403);
    if (papeis.length && !papeis.includes(p)) throw new ErroUso('Só o dono ou um admin da equipe pode fazer isso.', 403); return eq; };
  const ver = (e, u) => { const eq = exige(e, u); return { ...eq, meuPapel: papelDe(e, u), membros: q.membros.all(e) }; };

  return {
    minhas: (u) => q.minhas.all(u),
    ver,
    membrosDe: (e) => q.membros.all(e).map(m => m.id),
    criar(u, { nome }) {
      nome = String(nome || '').trim(); if (nome.length < 2 || nome.length > 60) throw new ErroUso('Dê à equipe um nome de 2 a 60 letras.');
      const sala = conversas.criarGrupo(u, { nome, membros: [] }), { lastInsertRowid } = q.nova.run(nome, sala, u, Date.now()), id = Number(lastInsertRowid);
      q.entrar.run(id, u, 'dono', Date.now()); return ver(id, u);
    },
    adicionar(e, u, { nick }) {
      const eq = exige(e, u, 'dono', 'admin'), novo = contas.porNick(nick);
      if (!novo) throw new ErroUso(`Ninguém com o nick @${String(nick || '').replace(/^@/, '')}.`, 404);
      if (papelDe(e, novo.id)) throw new ErroUso(`@${novo.nick} já está na equipe.`, 409);
      q.entrar.run(e, novo.id, 'membro', Date.now()); conversas.entrarNaSala(eq.sala, novo.id); return { equipe: ver(e, u), novo };
    },
    remover(e, u, alvo) {
      const eq = exige(e, u); alvo = Number(alvo); const pAlvo = papelDe(e, alvo), pEu = papelDe(e, u);
      if (!pAlvo) throw new ErroUso('Essa pessoa não está na equipe.', 404);
      if (alvo !== u && !['dono', 'admin'].includes(pEu)) throw new ErroUso('Só o dono ou um admin pode tirar alguém.', 403);
      if (pAlvo === 'dono') throw new ErroUso(alvo === u ? 'Passe a equipe para outra pessoa antes de sair.' : 'O dono não pode ser removido.', 409);
      if (pAlvo === 'admin' && pEu !== 'dono' && alvo !== u) throw new ErroUso('Só o dono tira um admin.', 403);
      q.sair.run(e, alvo); conversas.sairDaSala(eq.sala, alvo);
    },
    papel(e, u, alvo, papel) {
      exige(e, u, 'dono'); alvo = Number(alvo);
      if (!papelDe(e, alvo)) throw new ErroUso('Essa pessoa não está na equipe.', 404);
      if (papel === 'dono') { q.mudarPapel.run('admin', e, u); q.mudarPapel.run('dono', e, alvo); q.mudarDono.run(alvo, e); }   // passa a equipe: o antigo dono vira admin
      else if (papel === 'admin' || papel === 'membro') { if (alvo === u) throw new ErroUso('Passe a equipe antes de mudar o próprio papel.', 409); q.mudarPapel.run(papel, e, alvo); }
      else throw new ErroUso('Papel inválido.');
      return ver(e, u);
    },
    renomear(e, u, nome) { exige(e, u, 'dono', 'admin'); nome = String(nome || '').trim(); if (nome.length < 2 || nome.length > 60) throw new ErroUso('Dê à equipe um nome de 2 a 60 letras.'); q.renomear.run(nome, e); return ver(e, u); },
    apagar(e, u) { const eq = exige(e, u, 'dono'); const membros = q.membros.all(e).map(m => m.id); q.apagar.run(e); for (const m of membros) conversas.sairDaSala(eq.sala, m); return membros; },
  };
}
