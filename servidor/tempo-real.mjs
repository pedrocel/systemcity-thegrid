// Tempo real, por WebSocket em /ws: presença (quem está online e onde anda na cidade), entrega de mensagens e convites,
// e a sinalização das chamadas WebRTC. O áudio e o vídeo não passam por aqui: vão direto de navegador a navegador.
//
// Do navegador para o servidor:
//   { t: 'posicao', cidade, x, z }               onde o boneco está (ou x: null para sumir do mapa)
//   { t: 'digitando', sala }
//   { t: 'chamada:entrar', sala } / { t: 'chamada:sair', sala }
//   { t: 'sinal', para, sala, dados }            oferta, resposta ou candidato ICE para outra pessoa da mesma chamada
//   { t: 'transcricao', sala, ligada }           liga ou desliga a transcrição da chamada (vale para todos nela)
//   { t: 'fala', sala, texto }                   uma frase reconhecida no navegador de quem falou
// Do servidor para o navegador:
//   { t: 'presenca', pessoas: [{ id, nome, cidade, x, z }] }
//   { t: 'mensagem', mensagem } · { t: 'digitando', sala, usuario } · { t: 'reuniao', reuniao } · { t: 'sala', sala }
//   { t: 'chamada', sala, participantes: [ids] }  quem está na chamada da sala (chega a todos os membros: é o "tocando")
//   { t: 'sinal', de, sala, dados }
//   { t: 'transcricao', sala, ligada, por }      · { t: 'fala', fala: { id, sala, autor, texto, criada } }   legendas ao vivo
import { WebSocketServer } from 'ws';
import { lerCookie } from './contas.mjs';

export function tempoReal(servidor, { contas, conversas, origens, ganchos = {} }) {   // ganchos: { mensagem(u, m) → true se tratou, saiu(u) } para outros módulos (corridas)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const conexoes = new Map();   // usuario -> Set<ws>
  const onde = new Map();       // usuario -> { cidade, x, z }
  const chamadas = new Map();   // sala -> Set<usuario>
  const transcrevendo = new Map();   // sala -> usuario que ligou; acaba sozinha quando a chamada esvazia

  const enviar = (ws, msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
  const para = (usuario, msg) => { for (const ws of conexoes.get(usuario) || []) enviar(ws, msg); };
  const paraSala = (sala, msg) => { for (const u of conversas.membrosDe(sala)) para(u, msg); };
  const online = () => [...conexoes.keys()].map(id => ({ id, nome: contas.usuario(id)?.nome, ...(onde.get(id) || {}) }));
  let presencaPendente = null, fechado = false;   // junta mudanças de posição: no máximo uma rodada de presença a cada 150 ms
  const avisarPresenca = () => { if (presencaPendente) return; presencaPendente = setTimeout(() => { presencaPendente = null; const msg = { t: 'presenca', pessoas: online() }; for (const u of conexoes.keys()) para(u, msg); }, 150); };
  const avisarChamada = (sala) => paraSala(sala, { t: 'chamada', sala, participantes: [...(chamadas.get(sala) || [])] });
  const paraChamada = (sala, msg) => { for (const u of chamadas.get(sala) || []) para(u, msg); };
  const sairDaChamada = (sala, u) => { const c = chamadas.get(sala); if (!c || !c.delete(u)) return; if (!c.size) { chamadas.delete(sala); transcrevendo.delete(sala); } avisarChamada(sala); };

  servidor.on('upgrade', (req, socket, cabeca) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    if (origens && req.headers.origin && !origens.includes(req.headers.origin)) return socket.destroy();   // sem isto outro site abriria o socket com o cookie do usuário
    const eu = contas.deToken(lerCookie(req, contas.COOKIE)); if (!eu) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
    wss.handleUpgrade(req, socket, cabeca, (ws) => wss.emit('connection', ws, eu));
  });

  wss.on('connection', (ws, eu) => {
    const u = eu.id; (conexoes.get(u) || conexoes.set(u, new Set()).get(u)).add(ws);
    enviar(ws, { t: 'presenca', pessoas: online() }); avisarPresenca();
    for (const [sala, c] of chamadas) if (conversas.ehMembro(sala, u)) { enviar(ws, { t: 'chamada', sala, participantes: [...c] }); if (transcrevendo.has(sala)) enviar(ws, { t: 'transcricao', sala, ligada: true, por: transcrevendo.get(sala) }); }
    ws.vivo = true; ws.on('pong', () => { ws.vivo = true; });

    ws.on('message', (bruto) => {
      if (fechado) return; let m; try { m = JSON.parse(bruto); } catch { return; } if (!m || typeof m !== 'object') return;
      if (ganchos.mensagem && ganchos.mensagem(u, m)) return;
      const sala = Number(m.sala);
      if (m.t === 'posicao') { if (m.x == null) onde.delete(u); else if (Number.isFinite(+m.x) && Number.isFinite(+m.z)) onde.set(u, { cidade: String(m.cidade || '').slice(0, 40), x: +m.x, z: +m.z }); avisarPresenca(); }
      else if (m.t === 'digitando' && conversas.ehMembro(sala, u)) { for (const o of conversas.membrosDe(sala)) if (o !== u) para(o, { t: 'digitando', sala, usuario: u }); }
      else if (m.t === 'chamada:entrar' && conversas.ehMembro(sala, u)) { for (const [s, c] of chamadas) if (s !== sala && c.has(u)) sairDaChamada(s, u);   // uma chamada por vez
        (chamadas.get(sala) || chamadas.set(sala, new Set()).get(sala)).add(u); avisarChamada(sala);
        if (transcrevendo.has(sala)) para(u, { t: 'transcricao', sala, ligada: true, por: transcrevendo.get(sala) }); }   // quem chega numa chamada já transcrita começa a transcrever também
      else if (m.t === 'chamada:sair') sairDaChamada(sala, u);
      else if (m.t === 'transcricao' && (chamadas.get(sala) || new Set()).has(u)) { if (m.ligada) transcrevendo.set(sala, u); else transcrevendo.delete(sala); paraSala(sala, { t: 'transcricao', sala, ligada: !!m.ligada, por: u }); }
      else if (m.t === 'fala' && transcrevendo.has(sala) && chamadas.get(sala).has(u)) { const fala = conversas.falar(sala, u, m.texto); if (fala) paraChamada(sala, { t: 'fala', fala }); }
      else if (m.t === 'sinal') { const c = chamadas.get(sala), alvo = Number(m.para);   // só repassa entre duas pessoas que estão na mesma chamada
        if (c && c.has(u) && c.has(alvo) && alvo !== u) para(alvo, { t: 'sinal', de: u, sala, dados: m.dados }); }
    });

    ws.on('close', () => {
      if (fechado) return;   // servidor desligando: o banco já pode estar fechado
      const minhas = conexoes.get(u); minhas.delete(ws);
      if (!minhas.size) { conexoes.delete(u); onde.delete(u); for (const s of [...chamadas.keys()]) sairDaChamada(s, u); if (ganchos.saiu) ganchos.saiu(u); avisarPresenca(); }
    });
  });

  const batimento = setInterval(() => { for (const ws of wss.clients) { if (!ws.vivo) { ws.terminate(); continue; } ws.vivo = false; ws.ping(); } }, 30000);
  wss.on('close', () => clearInterval(batimento));

  return {
    para, paraSala, transcrevendo: (sala) => transcrevendo.has(sala), online: () => [...conexoes.keys()],
    fechar: () => { fechado = true; clearTimeout(presencaPendente); clearInterval(batimento); for (const ws of wss.clients) ws.terminate(); wss.close(); },
  };
}
