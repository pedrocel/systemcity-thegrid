// SystemCity — The Grid: corrida de moto multiplayer dentro da cidade, com chamada de voz para fazer a daily correndo.
// Menu → sala de espera (na própria pista, motos paradas na grade) → contagem → corrida (voltas ou tempo-limite) → resultado.
// O servidor é o relógio da corrida; cada um manda a própria posição 10 vezes por segundo e vê a dos outros.
(() => {
'use strict';
const C = window.CID; if (!C || !C.encontros || !C.pista) return;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + Number(n).toString(16).padStart(6, '0');
const relogio = (ms) => { if (ms == null) return '—'; const t = Math.max(0, ms) / 1000, m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
const ENC = C.encontros, P = C.pista;

const G = { lista: [], placar: { linhas: [] }, temporada: 'mes', vezAnterior: null, corrida: null, assistindo: false, desvio: 0, tela: 'menu', ultimoEnvio: 0, ultimaPos: 0, ultimoNum: null, inicioVolta: 0, melhorVolta: null, chegou: false };   // desvio: relógio do servidor − o meu
const eu = () => ENC.eu();
const meu = () => G.corrida && G.corrida.jogadores.find(j => j.u === eu().id);
const agoraServ = () => Date.now() + G.desvio;

// ---------- interface ----------
const barra = $('.barra'), botao = document.createElement('button');
botao.className = 'bt forte'; botao.id = 'b-grid-jogo'; botao.textContent = 'The Grid'; botao.hidden = true; botao.title = 'Corrida de moto multiplayer, com chamada de voz';
barra.insertBefore(botao, barra.firstChild);
document.getElementById('app').insertAdjacentHTML('beforeend', `
  <section class="grid-tela" id="grid-tela" aria-label="The Grid" hidden><div class="grid-caixa" id="grid-caixa"></div></section>
  <div class="grid-hud" id="grid-hud" hidden></div>
  <div class="grid-placar" id="grid-placar" hidden></div>
  <div class="grid-vez vidro" id="grid-vez" aria-live="polite" hidden></div>
  <div class="grid-contagem" id="grid-contagem" aria-live="assertive" hidden></div>
  <div class="grid-acoes" id="grid-acoes" hidden><button class="bt" id="grid-ch">Chamada</button><button class="bt" id="grid-sair">Sair</button></div>`);
const vez = $('#grid-vez'), tela = $('#grid-tela'), caixa = $('#grid-caixa'), hud = $('#grid-hud'), placar = $('#grid-placar'), contagem = $('#grid-contagem'), acoes = $('#grid-acoes');

// o botão aparece quando a cidade tem servidor (o mesmo critério do botão Encontros)
const mostrarBotao = () => { botao.hidden = $('#b-encontros') ? $('#b-encontros').hidden : true; };
new MutationObserver(mostrarBotao).observe($('#b-encontros') || document.body, { attributes: true, attributeFilter: ['hidden'] }); mostrarBotao();
botao.addEventListener('click', () => { if (!eu()) return ENC.pedirEntrada(); abrirMenu(); });
const destaque = document.createElement('button'); destaque.className = 'grid-destaque'; destaque.innerHTML = '<span>▶</span> THE GRID'; destaque.title = 'Corrida de moto multiplayer'; destaque.hidden = true;
destaque.addEventListener('click', () => botao.click()); document.getElementById('app').appendChild(destaque);
setInterval(() => { destaque.hidden = botao.hidden || P.ativo() || !tela.hidden; }, 400);

async function abrirMenu() { G.tela = 'menu'; tela.hidden = false; try { [G.lista, G.placar] = await Promise.all([ENC.api('GET', '/api/corridas'), ENC.api('GET', `/api/grid/placar${G.temporada === 'sempre' ? '' : '?temporada=' + new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 7)}`)]); } catch {} desenhar(); }
function fecharTudo() { tela.hidden = true; hud.hidden = placar.hidden = contagem.hidden = acoes.hidden = true; if (P.ativo()) P.sair(); G.corrida = null; G.tela = 'menu'; }

function desenhar() {
  if (G.tela === 'menu') return desenharMenu();
  const c = G.corrida; if (!c) return desenharMenu();
  if (c.estado === 'fim') return desenharFim();
  if (c.estado === 'espera' || G.assistindo) return desenharEspera();
  tela.hidden = true;   // contagem e corrida: só a pista e o painel
}

function desenharMenu() {
  tela.hidden = false; const abertas = G.lista.filter(c => c.estado !== 'fim');
  caixa.innerHTML = `<h2 class="grid-titulo">THE GRID</h2><p class="grid-sub">Corrida de moto com chamada de voz. Crie uma corrida, chame o time e façam a daily na pista.</p>
    <h3>Corridas abertas</h3>
    ${abertas.length ? abertas.map(c => `<div class="grid-linha"><span><b>${esc(c.nome)}</b><small>${c.n} moto${c.n !== 1 ? 's' : ''} · ${c.voltas} volta${c.voltas > 1 ? 's' : ''} · até ${c.limiteMin} min · ${{ espera: 'na grade de largada', contagem: 'largando', correndo: 'em andamento' }[c.estado]}</small></span>
      <button class="bt forte" data-entrar="${c.id}">${c.estado === 'espera' ? 'Entrar' : 'Assistir'}</button></div>`).join('') : '<p class="grid-vazio">Nenhuma corrida aberta. Crie a primeira.</p>'}
    <h3>Nova corrida</h3>
    <form class="grid-form" id="grid-nova"><label>Nome<input name="nome" value="Daily" maxlength="60"></label><label>Voltas<input name="voltas" type="number" min="1" max="20" value="3"></label><label>Tempo-limite (min)<input name="limiteMin" type="number" min="1" max="60" value="15"></label>
      <label class="grid-marca"><input type="checkbox" name="daily" checked> Daily guiada</label><label>Fala de cada um (s)<input name="falaSeg" type="number" min="30" max="300" step="15" value="90"></label>
      <button class="bt forte">Criar e entrar</button></form><p class="grid-erro" role="alert"></p>
    <h3>Placar geral</h3>
    <div class="grid-abas"><button class="bt ${G.temporada !== 'sempre' ? 'forte' : ''}" data-temp="mes">Temporada de ${esc((G.placar && G.placar.nome) || 'agora')}</button><button class="bt ${G.temporada === 'sempre' ? 'forte' : ''}" data-temp="sempre">De sempre</button></div>
    ${(G.placar.linhas || []).length ? `<table class="grid-tabela"><thead><tr><th>#</th><th>Piloto</th><th>Pontos</th><th>Corridas</th><th>Vitórias</th><th>Melhor volta</th></tr></thead><tbody>${G.placar.linhas.map((p, i) => `<tr class="${p.u === eu().id ? 'eu' : ''}"><td>${medalha(i + 1)}</td><td>${esc(p.nome)} ${p.conquistas.map(q => `<span class="grid-conq" title="${esc(q.nome)}">${q.icone}</span>`).join('')}</td><td><b>${p.pontos}</b></td><td>${p.corridas}</td><td>${p.vitorias}</td><td>${relogio(p.melhor)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="grid-vazio">Ninguém pontuou ainda. Pontos: 25, 18, 15, 12, 10… por posição, +5 pela melhor volta da corrida e +3 por completar a prova.</p>'}
    <p class="grid-ajuda">W/↑ acelera · S/↓ freia · A/D ou ←/→ vira · Shift é o turbo · Esc sai</p>
    <button class="bt" id="grid-voltar">Voltar para a cidade</button>`;
  $$('[data-entrar]', caixa).forEach(b => b.addEventListener('click', () => entrar(+b.dataset.entrar)));
  $('#grid-nova').addEventListener('submit', async (ev) => { ev.preventDefault(); const f = ev.target;
    try { const r = await ENC.api('POST', '/api/corridas', { nome: f.nome.value, voltas: +f.voltas.value, limiteMin: +f.limiteMin.value, daily: f.daily.checked, falaSeg: +f.falaSeg.value }); aoEntrarNaCorrida(r); }
    catch (e) { $('.grid-erro', caixa).textContent = e.message; } });
  $('#grid-voltar').addEventListener('click', fecharTudo);
  $$('[data-temp]', caixa).forEach(b => b.addEventListener('click', () => { G.temporada = b.dataset.temp; abrirMenu(); }));
}
async function entrar(id) { try { aoEntrarNaCorrida(await ENC.api('POST', `/api/corridas/${id}/entrar`, {})); } catch (e) { alert(e.message); abrirMenu(); } }
function aoEntrarNaCorrida({ corrida, assistindo }) {
  G.corrida = corrida; G.assistindo = !!assistindo; G.tela = 'corrida'; G.desvio = corrida.agora - Date.now();
  if (!G.assistindo) { const j = meu(), vaga = corrida.jogadores.findIndex(x => x.u === eu().id);
    P.entrar({ cor: j.cor, vaga }); P.bloquear(true); G.chegou = false; G.festejou = false; G.melhorVolta = null; G.ultimaPos = 0;
    P.aoVolta((n) => { ENC.enviar({ t: 'corrida:volta', corrida: corrida.id, volta: n });
      const tempo = performance.now() - G.inicioVolta; G.inicioVolta = performance.now(); const melhor = G.melhorVolta == null || tempo < G.melhorVolta; if (melhor) G.melhorVolta = tempo;
      const total = G.corrida.voltas; if (n >= total) return;
      faixa(n + 1 === total ? 'ÚLTIMA VOLTA' : `VOLTA ${n + 1}/${total}`, n + 1 === total ? 'ultima' : '');
      if (melhor && n > 1) setTimeout(() => faixa(`MELHOR VOLTA · ${relogio(tempo)}`, 'roxo'), 1400); }); }
  acoes.hidden = false; atualizarBotaoChamada(); desenhar();
}

function desenharEspera() {
  const c = G.corrida, dono = c.dono === eu().id;
  tela.hidden = false; tela.classList.toggle('lateral', !G.assistindo);   // jogando: o painel fica de lado e a pista aparece atrás, com as motos na grade
  caixa.innerHTML = `<h2 class="grid-titulo pequeno">${esc(c.nome)}</h2>
    <p class="grid-sub">${c.voltas} volta${c.voltas > 1 ? 's' : ''} · tempo-limite ${c.limiteMin} min${G.assistindo ? ' · <b>você está assistindo</b>' : ''}</p>
    <h3>Na grade (${c.jogadores.length})</h3>
    ${c.jogadores.map(j => `<div class="grid-linha"><i class="grid-cor" style="--c:${hex(j.cor)}"></i><span><b>${esc(j.nome)}</b><small>${j.u === c.dono ? 'abre a corrida' : ''}${G.assistindo && c.estado !== 'espera' ? ` volta ${Math.min(j.volta + 1, c.voltas)}/${c.voltas}${j.terminou != null ? ' · terminou' : ''}` : ''}</small></span></div>`).join('')}
    ${c.estado === 'espera' ? (dono ? `<button class="bt forte cheio" id="grid-largar">Largar</button>` : '<p class="grid-sub">Esperando quem criou a corrida dar a largada.</p>') : ''}
    <p class="grid-ajuda">A chamada de voz fica num canto da tela durante a corrida. Dá para conversar enquanto pilota.</p>`;
  const l = $('#grid-largar'); if (l) l.addEventListener('click', () => ENC.enviar({ t: 'corrida:largar', corrida: c.id }));
}
const medalha = (n) => (n === 1 ? '<span class="m ouro">1º</span>' : n === 2 ? '<span class="m prata">2º</span>' : n === 3 ? '<span class="m bronze">3º</span>' : `${n}º`);
function contarPontos(raiz) { const t0 = performance.now(); const passo = (t) => { const k = Math.min(1, (t - t0 - 500) / 1200); for (const el of $$('[data-pontos]', raiz)) el.textContent = Math.round(Math.max(0, k) * +el.dataset.pontos); if (k < 1) requestAnimationFrame(passo); }; requestAnimationFrame(passo); }
function desenharFim() {
  const c = G.corrida; tela.hidden = false; tela.classList.remove('lateral'); hud.hidden = placar.hidden = contagem.hidden = true; P.bloquear(true);
  const r = c.ranking || [];
  caixa.innerHTML = `<h2 class="grid-titulo pequeno">Resultado · ${esc(c.nome)}</h2>
    <div class="grid-podio">${[1, 0, 2].map(i => r[i] ? `<div class="degrau d${i + 1}" style="--c:${hex(r[i].cor)}"><b>${esc(r[i].nome)}</b><span>${medalha(i + 1)}</span><em data-pontos="${r[i].pontos}">0</em></div>` : '').join('')}</div>
    <table class="grid-tabela"><thead><tr><th>#</th><th>Piloto</th><th>Voltas</th><th>Tempo</th><th>Melhor volta</th><th>Pontos</th></tr></thead><tbody>
    ${r.map((x, i) => `<tr class="${x.u === eu().id ? 'eu' : ''}" style="--atraso:${i * 120}ms"><td>${medalha(x.pos)}</td><td><i class="grid-cor" style="--c:${hex(x.cor)}"></i>${esc(x.nome)}</td><td>${x.voltas}/${c.voltas}</td><td>${x.tempo != null ? relogio(x.tempo) : 'não terminou'}</td><td>${relogio(x.melhor)}</td>
      <td><b data-pontos="${x.pontos || 0}">0</b>${(x.bonus || []).map(b => `<small class="grid-bonus">+${b.pontos} ${esc(b.nome)}</small>`).join('')}</td></tr>`).join('')}
    </tbody></table><div class="grid-fim-acoes"><button class="bt forte" id="grid-menu">Voltar ao menu</button><button class="bt" id="grid-ata">Ata da daily</button></div>`;
  $('#grid-ata').addEventListener('click', () => { const sala = c.sala; sairDaCorrida(false); fecharTudo(); ENC.abrirAtas(sala); });
  contarPontos(caixa);
  const minha = r.find(x => x.u === eu().id); if (minha && minha.pos === 1 && !G.festejou) { G.festejou = true; confete(); }
  $('#grid-menu').addEventListener('click', () => { sairDaCorrida(false); abrirMenu(); });
}

// ---------- chamada da corrida (a daily) ----------
const botaoCh = $('#grid-ch');
function atualizarBotaoChamada() { const na = G.corrida && ENC.naChamada() === G.corrida.sala; botaoCh.textContent = na ? 'Sair da chamada' : 'Entrar na chamada'; botaoCh.classList.toggle('forte', !na); }
botaoCh.addEventListener('click', async () => { if (!G.corrida) return;
  if (ENC.naChamada() === G.corrida.sala) ENC.sairDaChamada(); else await ENC.entrarNaChamada(G.corrida.sala, { compacta: true });
  atualizarBotaoChamada(); });
$('#grid-sair').addEventListener('click', () => { if (G.corrida && G.corrida.estado === 'correndo' && !G.assistindo && !confirm('Sair da corrida? Você abandona e não entra no resultado.')) return; sairDaCorrida(true); abrirMenu(); });
function sairDaCorrida(avisar) { if (G.corrida && avisar) ENC.enviar({ t: 'corrida:sair', corrida: G.corrida.id }); if (G.corrida && ENC.naChamada() === G.corrida.sala) ENC.sairDaChamada();
  if (P.ativo()) P.sair(); G.corrida = null; G.assistindo = false; hud.hidden = placar.hidden = contagem.hidden = acoes.hidden = true; tela.classList.remove('lateral'); }

// ---------- tempo real ----------
ENC.ouvir((m) => {
  if (m.t === 'corridas') { G.lista = m.lista; if (G.tela === 'menu' && !tela.hidden) desenhar(); }
  else if (m.t === 'corrida' && G.corrida && m.corrida.id === G.corrida.id) {
    const antes = G.corrida.estado; G.corrida = m.corrida; G.desvio = m.corrida.agora - Date.now();
    for (const j of m.corrida.jogadores) if (j.abandonou && j.u !== eu().id) P.tirarRemoto(j.u);
    if (antes !== m.corrida.estado || m.corrida.estado !== 'correndo') desenhar();
  }
  else if (m.t === 'corrida:pos' && G.corrida && m.corrida === G.corrida.id && P.ativo()) {
    const j = G.corrida.jogadores.find(x => x.u === m.u); if (j) P.remoto(m.u, { s: m.s, d: m.d, v: m.v, dir: m.dir }, j.cor, j.nome);
  }
  else if (m.t === 'chamada') atualizarBotaoChamada();
});

// ---------- a cada quadro: libera a moto na largada, manda a posição, desenha o painel ----------
function laco() {
  requestAnimationFrame(laco);
  const c = G.corrida; if (!c || !P.ativo() || G.assistindo) return;
  if (c.estado === 'fim') { hud.hidden = placar.hidden = contagem.hidden = vez.hidden = true; return; }
  const agora = agoraServ(), E = P.estado, j = meu();
  const correndo = c.estado === 'correndo' && j && j.terminou == null;
  P.bloquear(!correndo);
  if (performance.now() - G.ultimoEnvio > 100 && c.estado !== 'fim') { G.ultimoEnvio = performance.now(); ENC.enviar({ t: 'corrida:pos', corrida: c.id, s: E.s, d: E.d, v: E.v, dir: E.dir }); }
  // contagem regressiva grande no meio da tela
  if (c.estado === 'contagem' || (c.estado === 'correndo' && agora - c.largada < 900)) { const falta = Math.ceil((c.largada - agora) / 1000);
    const txt = falta > 0 ? String(falta) : 'JÁ!'; contagem.hidden = false;
    if (txt !== G.ultimoNum) { G.ultimoNum = txt; contagem.textContent = txt; contagem.classList.toggle('ja', falta <= 0); contagem.classList.remove('pulso'); void contagem.offsetWidth; contagem.classList.add('pulso'); if (falta <= 0) G.inicioVolta = performance.now(); } }
  else contagem.hidden = true;
  if (c.estado === 'espera') { hud.hidden = placar.hidden = true; return; }
  // posição: quem terminou fica na frente; os demais por volta e ponto da pista
  const prog = (x) => (x.terminou != null ? 1e9 - x.terminou : x.u === eu().id ? x.volta + E.s : x.volta + (C.pista.remotoS ? C.pista.remotoS(x.u) : 0));
  const ordem = [...c.jogadores].filter(x => !x.abandonou).sort((a, b) => prog(b) - prog(a)), pos = ordem.findIndex(x => x.u === eu().id) + 1;
  const decorrido = c.estado === 'correndo' ? agora - c.largada : 0, resta = c.limiteMin * 60e3 - decorrido;
  if (c.estado === 'correndo' && j && j.terminou == null && G.ultimaPos && pos !== G.ultimaPos && decorrido > 3000) faixa(pos < G.ultimaPos ? `▲ ${pos}º LUGAR` : `▼ ${pos}º lugar`, pos < G.ultimaPos ? 'sobe' : 'desce', true);
  G.ultimaPos = pos;
  if (j && j.terminou != null && !G.chegou) { G.chegou = true; faixa(`CHEGADA · ${pos}º`, 'chegada'); if (pos === 1) confete(); }
  hud.hidden = false;
  hud.innerHTML = `<div><small>posição</small><b>${pos}º</b><em>/${ordem.length}</em></div><div><small>volta</small><b>${Math.min((j ? j.volta : 0) + 1, c.voltas)}</b><em>/${c.voltas}</em></div>
    <div><small>tempo</small><b>${relogio(decorrido)}</b></div><div><small>falta</small><b class="${resta < 60e3 ? 'alerta' : ''}">${relogio(resta)}</b></div>
    <div><small>km/h</small><b>${Math.round(Math.abs(E.v) * 3.6)}</b>${E.turbo ? '<em class="turbo">TURBO</em>' : ''}</div>
    ${j && j.terminou != null ? `<div class="chegou">Você terminou em ${pos}º · ${relogio(j.terminou)}</div>` : ''}`;
  // daily guiada: de quem é a vez, quanto falta e o roteiro da fala
  const d = c.daily;
  if (d && c.estado === 'correndo' && d.vez >= 0 && d.vez < d.ordem.length) { const quem = c.jogadores.find(x => x.u === d.ordem[d.vez]), falta = d.falaSeg * 1000 - (agora - d.desde), minha = d.ordem[d.vez] === eu().id;
    if (G.vezAnterior !== d.vez) { G.vezAnterior = d.vez; faixa(minha ? 'SUA VEZ DE FALAR' : `VEZ DE ${(quem ? quem.nome : '').toUpperCase()}`, minha ? 'ultima' : '', !minha); }
    vez.hidden = false; vez.innerHTML = `<i class="grid-cor" style="--c:${hex(quem ? quem.cor : 0x37e6ff)}"></i><span><b>${minha ? 'Sua vez' : 'Fala ' + esc(quem ? quem.nome : '')}</b> · ${d.vez + 1} de ${d.ordem.length}<small>O que fiz ontem · O que vou fazer hoje · O que está me travando</small></span><em class="${falta < 15e3 ? 'alerta' : ''}">${relogio(Math.max(0, falta))}</em>${minha || c.dono === eu().id ? '<button class="bt" id="grid-passo">Passar a vez</button>' : ''}`;
    const pb = $('#grid-passo'); if (pb) pb.onclick = () => ENC.enviar({ t: 'corrida:proximo', corrida: c.id }); }
  else if (d && c.estado === 'correndo' && d.vez >= d.ordem.length) { vez.hidden = false; vez.innerHTML = '<span><b>Daily concluída</b><small>Todo mundo falou. Agora é só correr.</small></span>'; }
  else vez.hidden = true;
  placar.hidden = false;
  placar.innerHTML = ordem.map((x, i) => `<p class="${x.u === eu().id ? 'eu' : ''}"><i class="grid-cor" style="--c:${hex(x.cor)}"></i>${i + 1}. ${esc(x.nome)}<span>${x.terminou != null ? relogio(x.terminou) : `volta ${Math.min(x.volta + 1, c.voltas)}`}</span></p>`).join('');
}
requestAnimationFrame(laco);

// ---------- teclado: enquanto a pista está ligada, as teclas são da moto ----------
const DA_MOTO = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);
document.addEventListener('keydown', (e) => { if (!P.ativo() || e.target.closest('input, textarea')) return;
  if (e.code === 'Escape') { $('#grid-sair').click(); return; }
  if (DA_MOTO.has(e.code)) { P.teclas.add(e.code); e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener('keyup', (e) => { if (DA_MOTO.has(e.code)) { P.teclas.delete(e.code); if (P.ativo()) e.stopPropagation(); } }, true);
window.addEventListener('blur', () => P.teclas.clear());
// ---------- animações: faixas que atravessam a tela e confete na chegada ----------
let faixaAtual = null;
function faixa(texto, tipo = '', pequena = false) {
  if (pequena && faixaAtual && !faixaAtual.classList.contains('pequena')) return;   // aviso de posição não atropela a faixa de volta
  if (faixaAtual) faixaAtual.remove();
  const el = document.createElement('div'); el.className = `grid-faixa ${tipo} ${pequena ? 'pequena' : ''}`; el.textContent = texto; document.body.appendChild(el); faixaAtual = el;
  setTimeout(() => { el.remove(); if (faixaAtual === el) faixaAtual = null; }, pequena ? 1500 : 2300);
}
function confete() {
  const cv = document.createElement('canvas'), g = cv.getContext('2d'); cv.className = 'grid-confete'; document.body.appendChild(cv);
  const W = cv.width = innerWidth, H = cv.height = innerHeight, cores = ['#37e6ff', '#ff8a3c', '#5fd38d', '#f472b6', '#ffd24a', '#a78bfa'];
  const ps = Array.from({ length: 160 }, () => ({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.45, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 10, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: cores[Math.floor(Math.random() * cores.length)], w: 6 + Math.random() * 6 }));
  const t0 = performance.now(); (function anima(t) { g.clearRect(0, 0, W, H); const fim = t - t0 > 3200;
    for (const p of ps) { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - (t - t0) / 3200); g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); g.restore(); }
    if (fim) cv.remove(); else requestAnimationFrame(anima); })(t0);
}
// ---------- toque: volante, acelerador, freio e turbo na tela (celular e tablet) ----------
if (matchMedia('(pointer: coarse)').matches) {
  document.body.classList.add('toque');
  document.body.insertAdjacentHTML('beforeend', `<div class="grid-toque" aria-hidden="true"><div class="volante"><button data-tecla="ArrowLeft">◀</button><button data-tecla="ArrowRight">▶</button></div>
    <div class="pedais"><button class="turbo" data-tecla="ShiftLeft">TURBO</button><button data-tecla="ArrowUp">▲</button><span></span><button data-tecla="ArrowDown">▼</button></div></div>`);
  for (const b of document.querySelectorAll('.grid-toque [data-tecla]')) {
    const solta = () => { P.teclas.delete(b.dataset.tecla); b.classList.remove('on'); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); P.teclas.add(b.dataset.tecla); b.classList.add('on'); if (navigator.vibrate) navigator.vibrate(8); });
    b.addEventListener('pointerup', solta); b.addEventListener('pointercancel', solta); b.addEventListener('lostpointercapture', solta);
  }
}
C.theGrid = { abrir: abrirMenu, faixa, confete };
ENC.aoEntrar(() => { if (location.hash === '#grid') setTimeout(abrirMenu, 300); });   // /cidade.html#grid abre direto o menu do jogo
})();
