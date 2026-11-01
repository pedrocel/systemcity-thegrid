// SystemCity — replay: grava a cada ~10 s quantos itens há em cada prédio e, no modo Replay, toca de volta qualquer
// momento das últimas horas: os prédios crescem com a fila gravada, os incidentes pegam fogo e as obras aparecem no dia em que foram combinadas.
// Só nas cidades guardadas no servidor (cidade.html?c=<slug>).
(() => {
'use strict';
const C = window.CID, SLUG = window.SYSTEMCITY_SLUG; if (!C || !C.encontros || !SLUG) return;
const $ = (s) => document.querySelector(s), ENC = C.encontros;
const R = { dados: null, t: 0, tocando: false, ritmo: 60, ultimo: 0 };
const hora = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

// gravação: manda o instante atual (as filas de verdade, ou as simuladas) a cada 10 s enquanto a página está aberta
setInterval(() => { if (C.replay || !ENC.eu() || document.hidden) return; const filas = {}; for (const n of C.api.parados()) if (n.dentro) filas[n.dentro] = (filas[n.dentro] || 0) + 1;
  ENC.api('POST', `/api/cidades/${SLUG}/instante`, { filas }).catch(() => {}); }, 10000);

document.getElementById('app').insertAdjacentHTML('beforeend', `<section class="replay vidro" id="replay" aria-label="Replay da cidade" hidden>
  <div class="rp-cab"><b>Replay</b><span id="rp-hora"></span><span class="rp-esp"></span>
    <select id="rp-janela" aria-label="Período"><option value="1">última hora</option><option value="6" selected>últimas 6 horas</option><option value="24">últimas 24 horas</option><option value="48">últimas 48 horas</option></select>
    <div class="seg" role="group" aria-label="Velocidade"><button class="bt" data-r="20">20×</button><button class="bt" data-r="60" aria-pressed="true">60×</button><button class="bt" data-r="300">300×</button></div>
    <button class="bt forte" id="rp-play">Tocar</button><button class="bt" id="rp-sair">Voltar ao vivo</button></div>
  <div class="rp-trilha"><canvas id="rp-graf" height="40"></canvas><input type="range" id="rp-pos" min="0" max="1000" value="1000" aria-label="Momento"></div>
  <p class="rp-nota" id="rp-nota"></p></section>`);
const caixa = $('#replay'), bt = document.createElement('button'); bt.className = 'bt'; bt.id = 'b-replay'; bt.textContent = 'Replay'; bt.title = 'Voltar no tempo e ver a cidade como estava';
$('.barra').insertBefore(bt, $('#b-encontros')); bt.hidden = true; ENC.aoEntrar(() => { bt.hidden = false; }); if (ENC.eu()) bt.hidden = false;

async function abrir() {
  const horas = +$('#rp-janela').value, ate = Date.now(); caixa.hidden = false; $('#rp-nota').textContent = 'Carregando…';
  try { R.dados = await ENC.api('GET', `/api/cidades/${SLUG}/linha?de=${ate - horas * 3600e3}&ate=${ate}`); } catch (e) { $('#rp-nota').textContent = e.message; return; }
  const n = R.dados.instantes.length;
  $('#rp-nota').textContent = n ? `${n} instantes gravados · ${R.dados.incidentes.length} incidente(s) · ${R.dados.obras.length} obra(s) no período. Arraste a linha ou toque.` : 'Nada gravado neste período ainda. A cidade grava sozinha a cada 10 segundos enquanto alguém está com ela aberta.';
  grafico(); C.replay = { filas: {} }; R.t = R.dados.de; mostrar(R.dados.de);
}
function grafico() {   // total de itens na cidade ao longo do período: o "eletrocardiograma" da produção
  const cv = $('#rp-graf'), g = cv.getContext('2d'), W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = 40 * devicePixelRatio, d = R.dados;
  g.clearRect(0, 0, W, H); const tot = d.instantes.map(i => [i.q, Object.values(i.f).reduce((a, b) => a + b, 0)]), max = Math.max(1, ...tot.map(x => x[1])), x = (t) => (t - d.de) / (d.ate - d.de) * W;
  for (const inc of d.incidentes) { g.fillStyle = 'rgba(255,93,108,.25)'; g.fillRect(x(inc.aberto), 0, Math.max(3, x(inc.resolvido || d.ate) - x(inc.aberto)), H); }
  g.strokeStyle = '#37e6ff'; g.lineWidth = 1.5 * devicePixelRatio; g.beginPath(); tot.forEach(([q, v], k) => { const px = x(q), py = H - (v / max) * (H - 4) - 2; k ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
}
function mostrar(t) {
  const d = R.dados; if (!d) return; R.t = t; $('#rp-pos').value = Math.round((t - d.de) / (d.ate - d.de) * 1000); $('#rp-hora').textContent = hora(t);
  let ultimo = null; for (const i of d.instantes) { if (i.q > t) break; ultimo = i; } C.replay.filas = ultimo && t - ultimo.q < 60e3 ? ultimo.f : {};
  if (C.incidentes) for (const inc of d.incidentes) { const ativo = inc.aberto <= t && (!inc.resolvido || inc.resolvido > t); if (ativo) C.incidentes.acender({ ...inc, cidade: SLUG, resolvido: null }); else C.incidentes.apagar(inc.id); }
}
function laco(agora) {
  requestAnimationFrame(laco); if (!R.tocando || !R.dados) { R.ultimo = agora; return; }
  const dt = (agora - (R.ultimo || agora)) / 1000; R.ultimo = agora; const t = R.t + dt * 1000 * R.ritmo;
  if (t >= R.dados.ate) { R.tocando = false; $('#rp-play').textContent = 'Tocar'; mostrar(R.dados.ate); return; } mostrar(t);
}
function sair() { R.tocando = false; caixa.hidden = true; C.replay = null; if (C.incidentes && R.dados) for (const inc of R.dados.incidentes) if (inc.resolvido) C.incidentes.apagar(inc.id); R.dados = null; }
bt.onclick = () => (caixa.hidden ? abrir() : sair());
$('#rp-sair').onclick = sair; $('#rp-janela').onchange = abrir;
$('#rp-play').onclick = () => { if (!R.dados) return; if (R.t >= R.dados.ate - 1000) mostrar(R.dados.de); R.tocando = !R.tocando; $('#rp-play').textContent = R.tocando ? 'Pausar' : 'Tocar'; };
$('#rp-pos').oninput = (e) => { if (!R.dados) return; R.tocando = false; $('#rp-play').textContent = 'Tocar'; mostrar(R.dados.de + (R.dados.ate - R.dados.de) * (+e.target.value / 1000)); };
caixa.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { R.ritmo = +b.dataset.r; caixa.querySelectorAll('[data-r]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
requestAnimationFrame(laco);
})();
