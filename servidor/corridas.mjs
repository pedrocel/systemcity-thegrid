// The Grid: corridas de moto multiplayer. Cada corrida tem uma sala de conversa própria (é nela que acontece a chamada
// de voz da daily) e vive na memória do servidor: acabou, some depois de um tempo.
//
// Ciclo: espera → contagem (3 s) → correndo → fim. Acaba quando todos completam as voltas ou quando o tempo-limite estoura.
// O servidor é o relógio da corrida (largada, tempo de volta, tempo final); a posição na pista vem de cada jogador e é repassada aos outros.
//
// Do navegador:  { t: 'corrida:largar', corrida } · { t: 'corrida:pos', corrida, s, d, v, dir, volta } · { t: 'corrida:volta', corrida, volta }
//                { t: 'corrida:sair', corrida } · { t: 'corrida:encerrar', corrida } · { t: 'corrida:proximo', corrida } (daily: passa a vez)
// Daily guiada (daily: true): na largada, cada piloto tem `falaSeg` segundos de vez para falar, em ordem; o servidor passa a vez sozinho.
// Para o navegador:  { t: 'corridas', lista } (para todos online) · { t: 'corrida', corrida } (para quem está nela)
//                    { t: 'corrida:pos', corrida, u, s, d, v, dir, volta }
import { ErroUso } from './contas.mjs';

const CONTAGEM_MS = 3500, GUARDA_FIM_MS = 15 * 60e3, MAX_JOGADORES = 12;
// pontos por posição (como na Fórmula 1), +5 para a melhor volta da corrida, +3 para quem completa todas as voltas
const PONTOS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], BONUS_MELHOR = 5, BONUS_COMPLETOU = 3;
const CORES = [0x37e6ff, 0xff8a3c, 0x5fd38d, 0xf472b6, 0xffd24a, 0xa78bfa, 0xff5d6c, 0x4fd1c5, 0xe8eef8, 0x3fa9f5, 0xfbbf24, 0x86efac];

export function corridas({ db, conversas, contas, rt, contagemMs = CONTAGEM_MS, voltaMinMs = 4000 }) {
  const gravar = db.prepare('INSERT INTO grid_pontos (usuario, corrida, posicao, pilotos, pontos, tempo, melhor, criada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  // placar de uma temporada (mês "AAAA-MM") ou de sempre; as conquistas saem das mesmas contas
  const placarDe = db.prepare(`SELECT p.usuario AS u, u.nome, sum(p.pontos) AS pontos, count(*) AS corridas, sum(p.posicao = 1) AS vitorias, sum(p.posicao <= 3) AS podios, min(p.melhor) AS melhor
    FROM grid_pontos p JOIN usuarios u ON u.id = p.usuario WHERE p.criada >= ? AND p.criada < ? GROUP BY p.usuario ORDER BY pontos DESC, vitorias DESC LIMIT 20`);
  function placarTemporada(temporada) {
    let de = 0, ate = 8.64e15, nome = 'de sempre';
    if (/^\d{4}-\d{2}$/.test(temporada || '')) { const [a, m] = temporada.split('-').map(Number); de = new Date(a, m - 1, 1).getTime(); ate = new Date(a, m, 1).getTime(); nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }
    const linhas = placarDe.all(de, ate), recorde = Math.min(...linhas.map(l => l.melhor ?? Infinity));
    return { temporada: temporada || null, nome, linhas: linhas.map((l, i) => ({ ...l, conquistas: [
      ...(i === 0 && temporada ? [{ id: 'campeao', nome: 'Campeão da temporada', icone: '🏆' }] : []),
      ...(l.melhor != null && l.melhor === recorde ? [{ id: 'volta', nome: 'Volta mais rápida', icone: '⚡' }] : []),
      ...(l.vitorias >= 3 ? [{ id: 'trinca', nome: '3 vitórias', icone: '🥇' }] : []),
      ...(l.corridas >= 10 ? [{ id: 'assiduo', nome: '10 dailys na pista', icone: '🔁' }] : []),
      ...(l.podios >= 5 ? [{ id: 'podio', nome: '5 pódios', icone: '🎖' }] : []),
    ] })) };
  }
  const todas = new Map(); let seq = 0;

  const resumo = (c) => ({ id: c.id, nome: c.nome, sala: c.sala, dono: c.dono, voltas: c.voltas, limiteMin: c.limiteMin, estado: c.estado,
    largada: c.largada, fim: c.fim, agora: Date.now(), daily: c.daily ? { falaSeg: c.daily.falaSeg, ordem: c.daily.ordem, vez: c.daily.vez, desde: c.daily.desde } : null,
    jogadores: [...c.jogadores.entries()].map(([u, j]) => ({ u, nome: j.nome, cor: j.cor, volta: j.volta, terminou: j.terminou, melhor: j.melhor, abandonou: !!j.abandonou })),
    ranking: c.ranking || null });
  const aberta = (c) => c.estado !== 'fim' || Date.now() - c.fim < GUARDA_FIM_MS;
  const lista = () => [...todas.values()].filter(aberta).map(c => ({ ...resumo(c), jogadores: undefined, n: c.jogadores.size }));
  const avisarLista = () => { const msg = { t: 'corridas', lista: lista() }; for (const u of rt.online()) rt.para(u, msg); };
  const avisar = (c) => { const msg = { t: 'corrida', corrida: resumo(c) }; for (const u of conversas.membrosDe(c.sala)) rt.para(u, msg); avisarLista(); };
  const achar = (id) => { const c = todas.get(Number(id)); if (!c) throw new ErroUso('Corrida não encontrada.', 404); return c; };
  const progresso = (j) => (j.terminou != null ? 1e9 - j.terminou : j.volta + (j.s || 0));   // quem terminou fica na frente, pelo tempo

  function finalizar(c) {
    if (c.estado === 'fim') return; clearTimeout(c.relogio); if (c.daily) clearTimeout(c.daily.relogio); c.estado = 'fim'; c.fim = Date.now();
    c.ranking = [...c.jogadores.entries()].filter(([, j]) => !j.abandonou).sort(([, a], [, b]) => progresso(b) - progresso(a))
      .map(([u, j], i) => ({ pos: i + 1, u, nome: j.nome, cor: j.cor, voltas: j.volta, tempo: j.terminou, melhor: j.melhor }));
    const melhorDaCorrida = Math.min(...c.ranking.map(r => r.melhor ?? Infinity));
    for (const r of c.ranking) {
      r.bonus = [];
      if (r.voltas > 0) { r.pontosPos = PONTOS[r.pos - 1] || 0; } else r.pontosPos = 0;   // quem não completou nenhuma volta não pontua por posição
      if (r.melhor != null && r.melhor === melhorDaCorrida) r.bonus.push({ nome: 'melhor volta', pontos: BONUS_MELHOR });
      if (r.tempo != null) r.bonus.push({ nome: 'completou a prova', pontos: BONUS_COMPLETOU });
      r.pontos = r.pontosPos + r.bonus.reduce((a, b) => a + b.pontos, 0);
      gravar.run(r.u, c.nome, r.pos, c.ranking.length, r.pontos, r.tempo, r.melhor, c.fim);
    }
    avisar(c);
  }
  // daily guiada: a vez passa para o próximo da ordem (pulando quem abandonou); depois do último, acabou a daily, a corrida segue
  function passarVez(c) {
    const d = c.daily; clearTimeout(d.relogio);
    do d.vez++; while (d.vez < d.ordem.length && (c.jogadores.get(d.ordem[d.vez]) || {}).abandonou);
    d.desde = Date.now(); if (d.vez < d.ordem.length) d.relogio = setTimeout(() => { passarVez(c); avisar(c); }, d.falaSeg * 1000);
    avisar(c);
  }
  // acabou quando todo mundo que está correndo terminou
  const talvezFim = (c) => { const vivos = [...c.jogadores.values()].filter(j => !j.abandonou); if (vivos.length && vivos.every(j => j.terminou != null)) finalizar(c); };

  const limpeza = setInterval(() => { for (const [id, c] of todas) if (!aberta(c)) todas.delete(id); }, 60e3); limpeza.unref();

  return {
    lista, placar: (temporada) => placarTemporada(temporada),
    criar(u, { nome, voltas, limiteMin, daily, falaSeg }) {
      nome = String(nome || '').trim().slice(0, 60) || 'Daily';
      voltas = Math.max(1, Math.min(20, Math.round(Number(voltas) || 3))); limiteMin = Math.max(1, Math.min(60, Math.round(Number(limiteMin) || 15)));
      const sala = conversas.criarGrupo(u, { nome: `The Grid · ${nome}`, membros: [] });
      const c = { id: ++seq, nome, sala, dono: u, voltas, limiteMin, estado: 'espera', criada: Date.now(), largada: null, fim: null, jogadores: new Map(),
        daily: daily ? { falaSeg: Math.max(30, Math.min(300, Math.round(Number(falaSeg) || 90))), ordem: [], vez: -1, desde: null } : null };
      todas.set(c.id, c); this.entrar(c.id, u); return { corrida: resumo(c), sala };
    },
    entrar(id, u) {
      const c = achar(id); conversas.entrarNaSala(c.sala, u);
      if (!c.jogadores.has(u)) {
        if (c.estado !== 'espera') { avisar(c); return { corrida: resumo(c), sala: c.sala, assistindo: true }; }   // corrida já largou: entra para assistir e conversar
        if (c.jogadores.size >= MAX_JOGADORES) throw new ErroUso(`A corrida já tem ${MAX_JOGADORES} motos.`, 409);
        const usadas = new Set([...c.jogadores.values()].map(j => j.cor));
        c.jogadores.set(u, { nome: contas.usuario(u).nome, cor: CORES.find(x => !usadas.has(x)) ?? CORES[u % CORES.length], volta: 0, s: 0, terminou: null, melhor: null, ultimaVolta: null });
      }
      avisar(c); return { corrida: resumo(c), sala: c.sala };
    },
    // mensagens do tempo real: devolve true se a mensagem era de corrida
    mensagem(u, m) {
      if (!String(m.t).startsWith('corrida:')) return false;
      const c = todas.get(Number(m.corrida)); if (!c) return true; const j = c.jogadores.get(u);
      if (m.t === 'corrida:largar' && u === c.dono && c.estado === 'espera' && c.jogadores.size) {
        c.estado = 'contagem'; c.largada = Date.now() + contagemMs; avisar(c);
        c.relogio = setTimeout(() => { c.estado = 'correndo'; for (const jj of c.jogadores.values()) jj.ultimaVolta = c.largada; if (c.daily) { c.daily.ordem = [...c.jogadores.keys()]; c.daily.vez = -1; passarVez(c); } avisar(c);
          c.relogio = setTimeout(() => finalizar(c), c.limiteMin * 60e3); }, contagemMs);
      } else if (m.t === 'corrida:pos' && j && c.estado !== 'fim') {
        j.s = Math.max(0, Math.min(1, Number(m.s) || 0));
        const msg = { t: 'corrida:pos', corrida: c.id, u, s: j.s, d: +m.d || 0, v: +m.v || 0, dir: +m.dir || 0, volta: j.volta };
        for (const o of c.jogadores.keys()) if (o !== u) rt.para(o, msg);
      } else if (m.t === 'corrida:volta' && j && c.estado === 'correndo' && j.terminou == null && Number(m.volta) === j.volta + 1) {
        const agora = Date.now(), tempoVolta = agora - j.ultimaVolta;
        if (tempoVolta < voltaMinMs) return true;   // volta impossível de rápida: ignora
        j.volta++; j.ultimaVolta = agora; j.melhor = j.melhor == null ? tempoVolta : Math.min(j.melhor, tempoVolta);
        if (j.volta >= c.voltas) j.terminou = agora - c.largada;
        avisar(c); talvezFim(c);
      } else if (m.t === 'corrida:sair' && j) {
        if (c.estado === 'espera') c.jogadores.delete(u); else j.abandonou = true;
        if (u === c.dono && c.estado === 'espera' && c.jogadores.size) c.dono = c.jogadores.keys().next().value;   // dono saiu antes da largada: passa a vez
        if (!c.jogadores.size) { clearTimeout(c.relogio); todas.delete(c.id); avisarLista(); return true; }
        avisar(c); if (c.estado === 'correndo') talvezFim(c);
      } else if (m.t === 'corrida:proximo' && c.daily && c.estado === 'correndo' && (u === c.dono || u === c.daily.ordem[c.daily.vez])) passarVez(c);
      else if (m.t === 'corrida:encerrar' && u === c.dono && (c.estado === 'correndo' || c.estado === 'contagem')) finalizar(c);
      return true;
    },
    saiu(u) { for (const c of todas.values()) if (c.jogadores.has(u) && c.estado !== 'fim') this.mensagem(u, { t: 'corrida:sair', corrida: c.id }); },
    fechar() { clearInterval(limpeza); for (const c of todas.values()) clearTimeout(c.relogio); },
  };
}
