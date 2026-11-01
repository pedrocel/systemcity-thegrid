// SystemCity — linha do tempo do git. Toca a história do projeto: cada bairro nasce no primeiro commit que mexe nele,
// os prédios crescem com o volume de mudanças e piscam a cada commit, e um cartão mostra quem fez o quê.
// Funciona na cidade gerada do GitHub (?c=) e no universo (?u=), onde junta o histórico de todos os repositórios.
(() => {
'use strict';
const C = window.CID, SLUG = window.SYSTEMCITY_SLUG, UNI = window.SYSTEMCITY_UNIVERSO; if (!C || !C.encontros || !(SLUG || UNI)) return;
const $ = (s) => document.querySelector(s), ENC = C.encontros;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const H = { commits: [], i: -1, tocando: false, ritmo: 3, ultimo: 0, nasceu: {}, churn: {} };
const dataBr = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

document.getElementById('app').insertAdjacentHTML('beforeend', `<section class="replay hist vidro" id="historia" aria-label="Linha do tempo do git" hidden>
  <div class="rp-cab"><b>Linha do tempo</b><span id="hs-data"></span><span class="rp-esp"></span>
    <div class="seg" role="group" aria-label="Velocidade"><button class="bt" data-r="1">1×</button><button class="bt" data-r="3" aria-pressed="true">3×</button><button class="bt" data-r="10">10×</button></div>
    <button class="bt forte" id="hs-play">Tocar</button><button class="bt" id="hs-sair">Voltar ao presente</button></div>
  <div class="rp-trilha"><canvas id="hs-graf" height="40"></canvas><input type="range" id="hs-pos" min="0" max="0" value="0" aria-label="Commit"></div>
  <div class="hs-commit" id="hs-commit"></div></section>`);
const caixa = $('#historia'), bt = document.createElement('button'); bt.className = 'bt'; bt.id = 'b-historia'; bt.textContent = 'Linha do tempo'; bt.title = 'A história do projeto, commit a commit';
$('.barra').insertBefore(bt, $('#b-encontros')); bt.hidden = true; ENC.aoEntrar(() => { bt.hidden = false; }); if (ENC.eu()) bt.hidden = false;

// mostrar ou esconder um bairro inteiro (chão, prédios, enchimento e rótulos)
function bairroVisivel(id, sim) {
  const b = C.BAIRRO[id]; if (!b) return;
  for (const o of b.objs || []) o.visible = sim; for (const m of b.enchimento || []) m.visible = sim;
  for (const p of C.PREDIOS) if (p.bairro === id && C.vivos[p.id]) { C.vivos[p.id].mesh.visible = sim; if (C.vivos[p.id].pedestal) C.vivos[p.id].pedestal.visible = sim; }
  for (const r of C.api.rotulos || []) if (r.predio && C.PREDIO[r.predio] && C.PREDIO[r.predio].bairro === id) r.el.style.visibility = sim ? '' : 'hidden';
}
async function abrir() {
  caixa.hidden = false; $('#hs-commit').innerHTML = '<p class="rp-nota">Buscando os commits no GitHub… na primeira vez pode levar um minuto.</p>';
  try { const r = await ENC.api('GET', UNI ? `/api/universos/${UNI}/historia` : `/api/cidades/${SLUG}/historia`); H.commits = r.commits; }
  catch (e) { $('#hs-commit').innerHTML = `<p class="rp-nota">${esc(e.message)}</p>`; return; }
  if (!H.commits.length) { $('#hs-commit').innerHTML = '<p class="rp-nota">Nenhum commit encontrado.</p>'; return; }
  H.nasceu = {}; for (const [k, c] of H.commits.entries()) for (const b of Object.keys(c.bairros)) if (H.nasceu[b] == null) H.nasceu[b] = k;
  $('#hs-pos').max = H.commits.length - 1; grafico(); C.replay = { filas: {} }; C.api.voarCidade(); ir(0);
}
function grafico() {   // commits por dia, com as linhas mudadas: o ritmo do time
  const cv = $('#hs-graf'), g = cv.getContext('2d'), W = cv.width = cv.clientWidth * devicePixelRatio, Hh = cv.height = 40 * devicePixelRatio, cs = H.commits, de = cs[0].quando, ate = cs[cs.length - 1].quando || de + 1;
  const dias = {}; for (const c of cs) { const d = Math.floor((c.quando - de) / 864e5); dias[d] = (dias[d] || 0) + c.adicoes + c.remocoes + 1; }
  const max = Math.max(...Object.values(dias)), n = Math.max(1, Math.ceil((ate - de) / 864e5)) + 1; g.clearRect(0, 0, W, Hh); g.fillStyle = '#37e6ff';
  for (const [d, v] of Object.entries(dias)) { const h = Math.max(2, Math.sqrt(v / max) * (Hh - 2)); g.fillRect(d / n * W, Hh - h, Math.max(2, W / n - 1), h); }
}
function ir(i) {
  i = Math.max(0, Math.min(H.commits.length - 1, i)); const c = H.commits[i]; H.i = i; $('#hs-pos').value = i; $('#hs-data').textContent = dataBr(c.quando);
  // quem já nasceu aparece; o tamanho de cada estação acompanha o volume de mudanças no bairro até aqui
  const churn = {}; for (let k = 0; k <= i; k++) for (const [b, v] of Object.entries(H.commits[k].bairros)) churn[b] = (churn[b] || 0) + v;
  for (const b of C.BAIRROS) { const vivo = H.nasceu[b.id] != null ? H.nasceu[b.id] <= i : true; bairroVisivel(b.id, vivo);
    const nivel = Math.min(14, Math.round(Math.log2(1 + (churn[b.id] || 0)))); for (const e of b.estacoes || []) C.replay.filas[e.id] = nivel; }
  for (const b of Object.keys(c.bairros)) { const bb = C.BAIRRO[b]; if (!bb) continue; for (const e of bb.estacoes || []) if (C.vivos[e.id]) C.vivos[e.id].pulso = 1; }
  const tocados = Object.keys(c.bairros).map(b => (C.BAIRRO[b] || {}).nome).filter(Boolean);
  $('#hs-commit').innerHTML = `<div class="hs-linha"><i class="avatar-mini">${esc(c.autor.slice(0, 2).toUpperCase())}</i><span><b>${esc(c.mensagem)}</b><small>${esc(c.autor)} · ${esc(c.repo)} · <code>${esc(c.sha)}</code> · ${new Date(c.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></span>
    <em><b class="mais">+${c.adicoes}</b> <b class="menos">−${c.remocoes}</b></em></div><p class="rp-nota">${i + 1} de ${H.commits.length} commits${tocados.length ? ` · mexeu em ${tocados.map(esc).join(', ')}` : c.arquivos ? ' · fora dos bairros mapeados' : ''}</p>`;
}
function laco(agora) { requestAnimationFrame(laco); if (!H.tocando) { H.ultimo = agora; return; } if (agora - H.ultimo < 1000 / H.ritmo) return; H.ultimo = agora;
  if (H.i >= H.commits.length - 1) { H.tocando = false; $('#hs-play').textContent = 'Tocar'; return; } ir(H.i + 1); }
function sair() { H.tocando = false; caixa.hidden = true; C.replay = null; for (const b of C.BAIRROS) bairroVisivel(b.id, true); }
bt.onclick = () => (caixa.hidden ? abrir() : sair());
$('#hs-sair').onclick = sair; $('#hs-pos').oninput = (e) => { H.tocando = false; $('#hs-play').textContent = 'Tocar'; ir(+e.target.value); };
$('#hs-play').onclick = () => { if (!H.commits.length) return; if (H.i >= H.commits.length - 1) ir(0); H.tocando = !H.tocando; $('#hs-play').textContent = H.tocando ? 'Pausar' : 'Tocar'; };
caixa.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { H.ritmo = +b.dataset.r; caixa.querySelectorAll('[data-r]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
requestAnimationFrame(laco);
})();
