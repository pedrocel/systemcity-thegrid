// SystemCity — incidentes: o prédio pega fogo (chamas, fumaça e luz vermelha), o time recebe o chamado para a sala de guerra
// e, ao resolver, o Claude escreve o post-mortem. Só nas cidades guardadas no servidor (cidade.html?c=<slug>).
(() => {
'use strict';
const C = window.CID, THREE = window.THREE, SLUG = window.SYSTEMCITY_SLUG; if (!C || !C.encontros || !THREE || !SLUG) return;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ENC = C.encontros, fogos = new Map();   // incidente.id -> { inc, g, chamas, luz }
const SEV = { baixa: 0.5, media: 0.75, alta: 1, critica: 1.35 };

function acender(inc) {
  if (fogos.has(inc.id) || inc.resolvido) return; const p = C.PREDIO[inc.predio]; if (!p) return;
  const g = new THREE.Group(), k = SEV[inc.severidade] || 1, topo = C.Y_CALCADA + (C.vivos[p.id] ? C.vivos[p.id].h : p.h || 6); g.position.set(p.p[0], 0, p.p[1]);
  const chamas = []; for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.7 + Math.random() * 0.6, 2.4 + Math.random() * 2, 6), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xff6a1a : 0xffd24a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set((Math.random() - 0.5) * p.f[0] * 0.7, topo + 1, (Math.random() - 0.5) * p.f[1] * 0.7); m.userData.fase = Math.random() * 6; g.add(m); chamas.push(m); }
  const fumaca = []; for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a2f38, transparent: true, opacity: 0.35, depthWrite: false })); s.userData.fase = i / 6; g.add(s); fumaca.push(s); }
  const luz = new THREE.PointLight(0xff3b1a, 2.2 * k, 40); luz.position.y = topo + 3; g.add(luz);
  const anel = new THREE.Mesh(new THREE.RingGeometry(p.f[0] * 0.8, p.f[0] * 0.8 + 0.6, 40), new THREE.MeshBasicMaterial({ color: 0xff3b1a, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); anel.rotation.x = -Math.PI / 2; anel.position.y = C.Y_CALCADA + 0.05; g.add(anel);
  g.scale.setScalar(k); g.position.y = 0; C.scene.add(g); p.incidente = inc.titulo;
  fogos.set(inc.id, { inc, g, chamas, fumaca, luz, anel, topo, cor: C.vivos[p.id] && C.vivos[p.id].teto.emissive.getHex() });
  desenharLista();
}
function apagar(id) { const al = document.getElementById('inc-alerta'); if (al && al.dataset.id === String(id)) al.hidden = true; const f = fogos.get(id); if (!f) return; C.scene.remove(f.g); const p = C.PREDIO[f.inc.predio]; if (p) delete p.incidente; if (f.cor != null && C.vivos[f.inc.predio]) C.vivos[f.inc.predio].teto.emissive.setHex(f.cor); fogos.delete(id); desenharLista(); }
function quadro(agora) {
  requestAnimationFrame(quadro); const t = agora / 1000;
  for (const f of fogos.values()) {
    for (const c of f.chamas) { const u = Math.sin(t * 9 + c.userData.fase) * 0.5 + 0.5; c.scale.set(0.8 + u * 0.4, 0.7 + u * 0.8, 0.8 + u * 0.4); c.material.opacity = 0.55 + u * 0.4; }
    for (const s of f.fumaca) { const k = (t * 0.25 + s.userData.fase) % 1; s.position.set(Math.sin(k * 6 + s.userData.fase * 9) * 1.5, f.topo + 3 + k * 14, Math.cos(k * 5) * 1.2); s.scale.setScalar(0.6 + k * 2.2); s.material.opacity = 0.4 * (1 - k); }
    f.luz.intensity = 1.6 + Math.sin(t * 13) * 0.6 + Math.sin(t * 7.3) * 0.4; f.anel.material.opacity = 0.35 + Math.sin(t * 4) * 0.3;
    const v = C.vivos[f.inc.predio]; if (v) v.teto.emissive.setHex(Math.sin(t * 5) > 0 ? 0xff2a10 : 0x5a0a04);
  }
}

// ---------- interface: botão, chamado e lista ----------
const barra = $('.barra'), botao = document.createElement('button'); botao.className = 'bt'; botao.id = 'b-incidente'; botao.hidden = true; barra.insertBefore(botao, $('#b-encontros'));
document.getElementById('app').insertAdjacentHTML('beforeend', `<aside class="enc inc vidro" id="incidentes" aria-label="Incidentes" hidden>
  <div class="enc-cab"><b>🔥 Incidentes</b><button class="bt" id="inc-fecha" aria-label="Fechar">✕</button></div><div class="enc-corpo" id="inc-corpo"></div></aside>`);
const painel = $('#incidentes'), corpo = $('#inc-corpo');
function desenharBotao() { botao.hidden = !ENC.eu(); botao.innerHTML = fogos.size ? `🔥 Incidentes<span class="cont" style="background:var(--rubi)">${fogos.size}</span>` : 'Incidentes'; botao.classList.toggle('alerta', fogos.size > 0); }
botao.addEventListener('click', () => { painel.hidden = !painel.hidden; if (!painel.hidden) carregarLista(); });
$('#inc-fecha').addEventListener('click', () => { painel.hidden = true; });
let recentes = [];
async function carregarLista() { recentes = await ENC.api('GET', `/api/cidades/${SLUG}/incidentes`).catch(() => []); desenharLista(); }
function desenharLista() {
  desenharBotao(); if (painel.hidden) return;
  const predios = C.PREDIOS.filter(p => p.tipo !== 'desvio').sort((a, b) => a.nome.localeCompare(b.nome));
  corpo.innerHTML = `${recentes.length ? recentes.map(i => `<div class="enc-reuniao ${i.resolvido ? '' : 'aberto'}"><h4>${i.resolvido ? '✓' : '🔥'} ${esc(i.titulo)}</h4>
      <p>${esc((C.PREDIO[i.predio] || {}).nome || i.predio)} · ${esc(i.severidade)} · ${new Date(i.aberto).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${i.resolvido ? ` · resolvido em ${Math.round((i.resolvido - i.aberto) / 60000)} min` : ''} · via ${esc(i.origem)}</p>
      <div class="enc-acoes">${i.resolvido ? `<button class="bt" data-pm="${i.sala}">Post-mortem</button>` : `<button class="bt forte" data-guerra="${i.sala}">Sala de guerra</button><button class="bt" data-ver="${esc(i.predio)}">Ver prédio</button><button class="bt" data-resolver="${i.id}">Resolver</button>`}</div></div>`).join('') : '<p class="enc-vazio">Nenhum incidente nesta cidade.</p>'}
    <form class="enc-form" id="inc-novo" style="margin-top:12px"><h4 style="margin:0">Declarar incidente</h4>
      <label>Prédio<select name="predio" required>${predios.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}${p.bairro ? ' · ' + esc((C.BAIRRO[p.bairro] || {}).nome || '') : ''}</option>`).join('')}</select></label>
      <label>O que está acontecendo<input name="titulo" maxlength="120" required placeholder="Ex.: pagamentos recusando tudo"></label>
      <label>Severidade<select name="severidade"><option value="media">média</option><option value="alta" selected>alta</option><option value="critica">crítica</option><option value="baixa">baixa</option></select></label>
      <p class="enc-erro" role="alert"></p><button class="bt forte">Pegar fogo e chamar o time</button></form>`;
  for (const s of corpo.querySelectorAll('select')) Object.assign(s.style, { background: 'rgba(4,9,18,.7)', color: 'var(--tinta)', border: '1px solid var(--linha-forte)', borderRadius: '8px', padding: '8px' });
  corpo.querySelectorAll('[data-guerra]').forEach(b => b.onclick = () => guerra(+b.dataset.guerra));
  corpo.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => C.api.escolher('p', b.dataset.ver));
  corpo.querySelectorAll('[data-pm]').forEach(b => b.onclick = async () => { const atas = await ENC.api('GET', `/api/salas/${b.dataset.pm}/atas`); painel.hidden = true; if (atas[0]) ENC.abrirAta ? ENC.abrirAta(atas[0].id, +b.dataset.pm) : null; });
  corpo.querySelectorAll('[data-resolver]').forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = 'O Claude está escrevendo o post-mortem…';
    try { await ENC.api('POST', `/api/incidentes/${b.dataset.resolver}/resolver`, {}); await carregarLista(); } catch (e) { alert(e.message); b.disabled = false; b.textContent = 'Resolver'; } });
  $('#inc-novo').addEventListener('submit', async (ev) => { ev.preventDefault(); const f = ev.target;
    try { await ENC.api('POST', `/api/cidades/${SLUG}/incidentes`, { predio: f.predio.value, titulo: f.titulo.value, severidade: f.severidade.value }); await carregarLista(); } catch (e) { $('.enc-erro', f).textContent = e.message; } });
}
function guerra(sala) { painel.hidden = true; ENC.abrirSala ? ENC.abrirSala(sala) : ENC.abrir(); ENC.entrarNaChamada(sala); }

// chamado: um alerta grande no topo, com som curto, para quem estiver na cidade
function chamar(inc) {
  const nome = (C.PREDIO[inc.predio] || {}).nome || inc.predio; let el = $('#inc-alerta');
  if (!el) { el = document.createElement('div'); el.id = 'inc-alerta'; el.className = 'inc-alerta vidro'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
  el.innerHTML = `<b>🔥 Incidente ${esc(inc.severidade)} em ${esc(nome)}</b><span>${esc(inc.titulo)}</span><button class="bt forte" id="inc-ir">Entrar na sala de guerra</button><button class="bt" id="inc-ver">Ver</button><button class="bt" id="inc-x" aria-label="Fechar">✕</button>`;
  el.hidden = false; el.dataset.id = inc.id; $('#inc-ir').onclick = () => { el.hidden = true; guerra(inc.sala); }; $('#inc-ver').onclick = () => C.api.escolher('p', inc.predio); $('#inc-x').onclick = () => { el.hidden = true; };
  C.api.escolher('p', inc.predio);
  try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = 660; g.gain.value = 0.05; o.connect(g).connect(a.destination); o.start(); o.frequency.setValueAtTime(880, a.currentTime + 0.18); o.stop(a.currentTime + 0.4); } catch {}
}
ENC.ouvir((m) => { if (m.t !== 'incidente' || m.incidente.cidade !== SLUG) return;
  if (m.incidente.resolvido) apagar(m.incidente.id); else { const novo = !fogos.has(m.incidente.id); acender(m.incidente); if (novo) chamar(m.incidente); }
  if (!painel.hidden) carregarLista(); });
async function iniciar() { desenharBotao(); const l = await ENC.api('GET', `/api/cidades/${SLUG}/incidentes`).catch(() => []); recentes = l; for (const i of l) if (!i.resolvido) acender(i); desenharBotao(); }
ENC.aoEntrar(iniciar); if (ENC.eu()) iniciar();
requestAnimationFrame(quadro);
C.incidentes = { acender, apagar };
})();
