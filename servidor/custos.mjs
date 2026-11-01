// Custos de IA: cada chamada ao Claude (gerar cidade, auditoria, ata, pergunta, agente…) é registrada com quem pediu, o tipo, os tokens e o custo.
// Quem pediu e o tipo vêm do contexto da requisição (AsyncLocalStorage): o trabalho em segundo plano que ela dispara herda o contexto.
// Preços em dólar por milhão de tokens; CUSTO_* no ambiente sobrescreve. Pelo Claude Code local, o custo vem pronto do próprio CLI.
import { AsyncLocalStorage } from 'node:async_hooks';

const PRECOS = {   // entrada, saída, leitura de cache, escrita de cache (US$ por milhão de tokens)
  'claude-opus-5-5': [4, 20, 0.2, 5], 'claude-sonnet-5-5': [2, 10, 0.2, 2.5], 'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
};
const contexto = new AsyncLocalStorage();
let registrarPadrao = null;   // o último banco ligado; cada servidor também põe o seu no contexto da requisição

export const comUso = (dados, fn) => contexto.run({ ...(contexto.getStore() || {}), ...dados }, fn);
export const usoAtual = () => contexto.getStore() || {};

export function custoDe(modelo, u = {}) {
  const p = PRECOS[modelo] || PRECOS['claude-opus-5-5'], [e, s, cl, ce] = [process.env.CUSTO_ENTRADA, process.env.CUSTO_SAIDA, process.env.CUSTO_CACHE_LEITURA, process.env.CUSTO_CACHE_ESCRITA].map((v, i) => (v ? Number(v) : p[i]));
  return ((u.input_tokens || 0) * e + (u.output_tokens || 0) * s + (u.cache_read_input_tokens || 0) * cl + (u.cache_creation_input_tokens || 0) * ce) / 1e6;
}
// chamado pelo ia.mjs e pelo agente depois de cada resposta
export function anotar({ modelo, via, uso = {}, custo = null, ms = 0, ok = true }) {
  const c = usoAtual(), registrar = c.registrar || registrarPadrao; if (!registrar) return;
  try { registrar({ usuario: c.usuario || null, tipo: c.tipo || 'outro', alvo: c.alvo || null, modelo, via, entrada: uso.input_tokens || 0, saida: uso.output_tokens || 0,
    cacheLeitura: uso.cache_read_input_tokens || 0, cacheEscrita: uso.cache_creation_input_tokens || 0, custo: custo != null ? custo : custoDe(modelo, uso), ms, ok }); } catch (e) { console.error('custos', e.message); }
}

export function custos(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS uso_ia (id INTEGER PRIMARY KEY, quando INTEGER NOT NULL, usuario INTEGER, tipo TEXT NOT NULL, alvo TEXT, modelo TEXT, via TEXT,
    entrada INTEGER NOT NULL DEFAULT 0, saida INTEGER NOT NULL DEFAULT 0, cache_leitura INTEGER NOT NULL DEFAULT 0, cache_escrita INTEGER NOT NULL DEFAULT 0,
    custo REAL NOT NULL DEFAULT 0, ms INTEGER, ok INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS uso_ia_quando ON uso_ia (quando); CREATE INDEX IF NOT EXISTS uso_ia_usuario ON uso_ia (usuario, quando);`);
  const nova = db.prepare('INSERT INTO uso_ia (quando, usuario, tipo, alvo, modelo, via, entrada, saida, cache_leitura, cache_escrita, custo, ms, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const registrar = (r) => nova.run(Date.now(), r.usuario, r.tipo, r.alvo, r.modelo, r.via, r.entrada, r.saida, r.cacheLeitura, r.cacheEscrita, r.custo, r.ms, r.ok ? 1 : 0);
  registrarPadrao = registrar;
  const desde = (dias) => Date.now() - dias * 864e5;
  return {
    registrar,
    // o painel do admin: total, por tipo, por dia e por pessoa (com o plano dela, para ver quem paga a própria conta)
    relatorio(dias = 30) {
      const t0 = desde(dias);
      return {
        dias, total: db.prepare('SELECT count(*) AS chamadas, coalesce(sum(custo), 0) AS custo, coalesce(sum(entrada), 0) AS entrada, coalesce(sum(saida), 0) AS saida FROM uso_ia WHERE quando >= ?').get(t0),
        porTipo: db.prepare('SELECT tipo, count(*) AS chamadas, sum(custo) AS custo, avg(custo) AS medio FROM uso_ia WHERE quando >= ? GROUP BY tipo ORDER BY custo DESC').all(t0),
        porDia: db.prepare("SELECT strftime('%Y-%m-%d', quando / 1000, 'unixepoch', '-3 hours') AS dia, count(*) AS chamadas, sum(custo) AS custo FROM uso_ia WHERE quando >= ? GROUP BY dia ORDER BY dia").all(t0),
        porPessoa: db.prepare(`SELECT x.usuario, u.nome, u.email, count(*) AS chamadas, sum(x.custo) AS custo, max(x.quando) AS ultimo FROM uso_ia x LEFT JOIN usuarios u ON u.id = x.usuario
          WHERE x.quando >= ? GROUP BY x.usuario ORDER BY custo DESC LIMIT 50`).all(t0),
        falhas: db.prepare('SELECT count(*) AS n FROM uso_ia WHERE quando >= ? AND ok = 0').get(t0).n,
      };
    },
    // quanto uma pessoa gastou no mês (para o teto do plano)
    doMes(usuario) { const i = new Date(); i.setDate(1); i.setHours(0, 0, 0, 0); return db.prepare('SELECT coalesce(sum(custo), 0) AS c FROM uso_ia WHERE usuario = ? AND quando >= ?').get(usuario, i.getTime()).c; },
  };
}
