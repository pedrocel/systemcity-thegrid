// Replay: a cidade grava, a cada ~10 s, quantos itens havia em cada prédio (quem estiver com ela aberta manda o instante).
// A linha do tempo devolve os instantes, os incidentes e as obras de um intervalo, para a página tocar de volta.
import { ErroUso } from './contas.mjs';

const INTERVALO_MS = 9000, GUARDA_MS = 7 * 864e5;

export function replay(db, { cidades }) {
  const q = {
    ultimo: db.prepare('SELECT max(quando) AS q FROM instantes WHERE cidade = ?'),
    gravar: db.prepare('INSERT OR IGNORE INTO instantes (cidade, quando, filas) VALUES (?, ?, ?)'),
    entre: db.prepare('SELECT quando, filas FROM instantes WHERE cidade = ? AND quando BETWEEN ? AND ? ORDER BY quando'),
    limites: db.prepare('SELECT min(quando) AS de, max(quando) AS ate, count(*) AS n FROM instantes WHERE cidade = ?'),
    incidentes: db.prepare('SELECT id, predio, titulo, severidade, aberto, resolvido FROM incidentes WHERE cidade = ? AND aberto <= ? AND (resolvido IS NULL OR resolvido >= ?)'),
    obras: db.prepare(`SELECT a.id, a.titulo, a.bairro, a.criada, a.feita_em FROM atividades a WHERE a.bairro IS NOT NULL AND a.criada <= ? AND (a.feita = 0 OR a.feita_em >= ?)
      AND a.sala IN (SELECT m.sala FROM membros m WHERE m.usuario = ?)`),
    limpar: db.prepare('DELETE FROM instantes WHERE quando < ?'),
  };
  const limpeza = setInterval(() => q.limpar.run(Date.now() - GUARDA_MS), 3600e3); limpeza.unref();
  return {
    // um instante por cidade a cada ~10 s, venha de quantas abas vier
    gravar(slug, u, filas) {
      cidades.ver(slug, u); const agora = Date.now(), ult = q.ultimo.get(slug).q || 0; if (agora - ult < INTERVALO_MS) return { gravado: false };
      const limpo = {}; for (const [k, v] of Object.entries(filas || {}).slice(0, 300)) { const n = Math.round(Number(v)); if (/^[\w-]{1,60}$/.test(k) && n > 0) limpo[k] = Math.min(n, 999); }
      q.gravar.run(slug, agora, JSON.stringify(limpo)); return { gravado: true };
    },
    linha(slug, u, de, ate) {
      cidades.ver(slug, u); const lim = q.limites.get(slug); ate = Number(ate) || Date.now(); de = Number(de) || ate - 6 * 3600e3;
      if (ate - de > 2 * 864e5) throw new ErroUso('Peça no máximo 48 horas de cada vez.');
      return { limites: lim, de, ate, instantes: q.entre.all(slug, de, ate).map(i => ({ q: i.quando, f: JSON.parse(i.filas) })), incidentes: q.incidentes.all(slug, ate, de), obras: q.obras.all(ate, de, u) };
    },
    fechar: () => clearInterval(limpeza),
  };
}
