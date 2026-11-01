// SystemCity — parte 3: andar pela cidade em terceira pessoa.
// Boneco feito de primitivas (sem modelo externo), colisão por caixas, interação por proximidade, minimapa e joystick de toque.
(() => {
'use strict';
const C = window.CID; if (!C || !C.api) return;
const { $, app, canvas, scene, camera, BAIRROS, BAIRRO, PREDIO, ROTAS, vivos, torres, solidos, hex } = C, api = C.api;

// ---------- o boneco ----------
const av = new THREE.Group(); av.visible = false; scene.add(av);
const mTerno = new THREE.MeshStandardMaterial({ color: 0x22324f, roughness: 0.65, metalness: 0.15 }), mCalca = new THREE.MeshStandardMaterial({ color: 0x172235, roughness: 0.8 });
const mCasco = new THREE.MeshStandardMaterial({ color: 0xdfe8f5, roughness: 0.35, metalness: 0.2 }), mLuz = new THREE.MeshBasicMaterial({ color: 0x6fc3ff }), mCracha = new THREE.MeshBasicMaterial({ color: 0xffffff });
const peca = (w, h, d, mat, x, y, z, pai) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); (pai || av).add(m); return m; };
const membro = (w, h, d, mat, x, y) => { const g = new THREE.Group(); g.position.set(x, y, 0); av.add(g); peca(w, h, d, mat, 0, -h / 2, 0, g); return g; };
const pernaE = membro(0.2, 0.85, 0.22, mCalca, -0.13, 0.85), pernaD = membro(0.2, 0.85, 0.22, mCalca, 0.13, 0.85);
const tronco = peca(0.52, 0.62, 0.3, mTerno, 0, 1.17, 0);
const bracoE = membro(0.14, 0.6, 0.16, mTerno, -0.34, 1.45), bracoD = membro(0.14, 0.6, 0.16, mTerno, 0.34, 1.45);
const cabeca = peca(0.32, 0.32, 0.32, mCasco, 0, 1.68, 0);
peca(0.33, 0.09, 0.05, mLuz, 0, 0.02, 0.15, cabeca);                 // visor
peca(0.53, 0.035, 0.31, mLuz, 0, 0.3, 0, tronco);                    // filete nos ombros
peca(0.11, 0.15, 0.02, mCracha, 0.13, 0.02, 0.16, tronco);           // crachá
peca(0.012, 0.2, 0.012, mLuz, 0.13, 0.19, 0.16, tronco);             // cordão do crachá
const aro = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.6, 40), new THREE.MeshBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); aro.rotation.x = -Math.PI / 2; aro.position.y = 0.05; av.add(aro);
const lanterna = new THREE.PointLight(0x7fc8ff, 0.55, 16, 2); lanterna.position.set(0, 2.4, 0); av.add(lanterna);

// ---------- a moto de luz: monotrilho, pilotoM deitado, aro aceso. De frente para +z, como o boneco ----------
const carro = new THREE.Group(); carro.visible = false; scene.add(carro);
const CIANO = 0x37e6ff;
const mMoto = new THREE.MeshStandardMaterial({ color: 0x090e16, roughness: 0.34, metalness: 0.8, emissive: 0x06131f, emissiveIntensity: 0.7 });
const mNeon = new THREE.MeshBasicMaterial({ color: CIANO });
const mPneu = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.95, metalness: 0.1 });
const mFato = new THREE.MeshStandardMaterial({ color: 0x0c131d, roughness: 0.6, metalness: 0.4, emissive: 0x071a26, emissiveIntensity: 0.8 });
const mVisor = new THREE.MeshBasicMaterial({ color: 0x9df3ff });
const mLanterna = new THREE.MeshBasicMaterial({ color: 0x7a1420 });
const pm = (g, mat, x, y, z, pai) => { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); (pai || carro).add(m); return m; };
const cx = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// as duas rodas ficam na MESMA linha (x=0): é moto, não carro. Aro de neon é a assinatura.
const geoDisco = new THREE.CylinderGeometry(0.62, 0.62, 0.19, 24); geoDisco.rotateZ(Math.PI / 2);
const geoAro = new THREE.TorusGeometry(0.6, 0.062, 8, 36); geoAro.rotateY(Math.PI / 2);
const geoCubo = new THREE.CylinderGeometry(0.16, 0.16, 0.23, 12); geoCubo.rotateZ(Math.PI / 2);
const rodas = [[1.28, true], [-1.28, false]].map(([z, dianteira]) => {
  const eixo = new THREE.Group(); eixo.position.set(0, 0.62, z); carro.add(eixo);
  const roda = new THREE.Mesh(geoDisco, mPneu); eixo.add(roda);
  roda.add(new THREE.Mesh(geoAro, mNeon));            // o aro gira junto: é o que dá o efeito de disco
  roda.add(new THREE.Mesh(geoCubo, mMoto));
  return { eixo, roda, dianteira };
});

// carenagem baixa ligando os dois cubos
pm(cx(0.3, 0.3, 2.05), mMoto, 0, 0.66, 0);
pm(cx(0.36, 0.34, 0.78), mMoto, 0, 0.62, 0.84);      // bico
pm(cx(0.32, 0.26, 0.66), mMoto, 0, 0.7, -0.92);      // rabeta
for (const lado of [-1, 1]) {
  pm(cx(0.02, 0.07, 1.95), mNeon, lado * 0.16, 0.7, 0);        // filete lateral
  pm(cx(0.05, 0.05, 0.5), mNeon, lado * 0.14, 0.52, 0.95);     // risco do bico
}
pm(cx(0.5, 0.05, 0.06), mMoto, 0, 0.86, 0.72);        // guidão
pm(cx(0.06, 0.03, 1.5), mNeon, 0, 0.82, -0.2);        // filete no alto da carenagem
pm(cx(0.26, 0.05, 0.05), mNeon, 0, 0.5, 1.2);          // farol de luz

// o pilotoM vai deitado: é a silhueta que identifica a moto
const pilotoM = new THREE.Group(); carro.add(pilotoM);
const troncoM = pm(cx(0.32, 0.24, 0.8), mFato, 0, 1.0, -0.12, pilotoM); troncoM.rotation.x = -0.5;
pm(cx(0.3, 0.03, 0.55), mNeon, 0, 1.13, 0.0, pilotoM).rotation.x = -0.5;    // faixa nas costas
const capaceteM = pm(new THREE.SphereGeometry(0.17, 14, 12), mFato, 0, 1.19, 0.38, pilotoM);
pm(new THREE.SphereGeometry(0.128, 12, 10), mVisor, 0, 1.16, 0.47, pilotoM);
for (const lado of [-1, 1]) {
  const bracoM = pm(cx(0.09, 0.09, 0.62), mFato, lado * 0.17, 1.0, 0.42, pilotoM); bracoM.rotation.x = 0.36;
  const pernaM = pm(cx(0.12, 0.13, 0.5), mFato, lado * 0.15, 0.82, -0.62, pilotoM); pernaM.rotation.x = -0.22;
}
const lantE = pm(cx(0.05, 0.06, 0.05), mLanterna, -0.12, 0.74, -1.24), lantD = pm(cx(0.05, 0.06, 0.05), mLanterna.clone(), 0.12, 0.74, -1.24);

// brilho no chão, embaixo da moto
// disco em vez de retângulo: borda dura embaixo da moto denuncia o truque
const geoBrilho = new THREE.CircleGeometry(1.5, 28);
const neon = new THREE.Mesh(geoBrilho, new THREE.MeshBasicMaterial({ color: CIANO, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
neon.rotation.x = -Math.PI / 2; neon.position.y = 0.04; neon.scale.set(0.62, 1, 1); carro.add(neon);
const farol = new THREE.SpotLight(0xbfefff, 1.9, 52, 0.5, 0.7, 1.2); farol.position.set(0, 0.7, 1.3); carro.add(farol); farol.target.position.set(0, 0.2, 12); carro.add(farol.target);

// ---------- o rastro: a parede de luz que a moto deixa para trás ----------
const TRILHA = 80;
const trilhaPos = new Float32Array(TRILHA * 2 * 3);
const geoTrilha = new THREE.BufferGeometry();
geoTrilha.setAttribute('position', new THREE.BufferAttribute(trilhaPos, 3));
{
  const idx = [];
  for (let i = 0; i < TRILHA - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  geoTrilha.setIndex(idx);
}
const trilha = new THREE.Mesh(geoTrilha, new THREE.MeshBasicMaterial({ color: CIANO, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
trilha.frustumCulled = false; trilha.visible = false; scene.add(trilha);
const rastro = [];   // últimos pontos por onde a moto passou
function limparRastro() { rastro.length = 0; trilha.visible = false; }
function moerRastro(x, y, z) {
  const ult = rastro[rastro.length - 1];
  if (ult && Math.hypot(x - ult[0], z - ult[2]) < 0.55) { ult[0] = x; ult[1] = y; ult[2] = z; }
  else rastro.push([x, y, z]);
  while (rastro.length > TRILHA) rastro.shift();
  if (rastro.length < 2) { trilha.visible = false; return; }
  for (let i = 0; i < TRILHA; i++) {
    const p = rastro[Math.min(i, rastro.length - 1)] || rastro[rastro.length - 1];
    const vivo = i < rastro.length;
    // parede de altura constante, afinando só na ponta mais velha — é assim que ela lê como rastro
    const f = i / Math.max(1, rastro.length - 1);
    const alt = vivo ? 0.98 * Math.min(1, f / 0.26) : 0;
    trilhaPos[i * 6] = p[0]; trilhaPos[i * 6 + 1] = p[1] + 0.03; trilhaPos[i * 6 + 2] = p[2];
    trilhaPos[i * 6 + 3] = p[0]; trilhaPos[i * 6 + 4] = p[1] + 0.03 + alt; trilhaPos[i * 6 + 5] = p[2];
  }
  geoTrilha.attributes.position.needsUpdate = true;
  geoTrilha.computeBoundingSphere();
  trilha.visible = true;
}

// ---------- estado ----------
const INICIO = (C.BAIRROS.find(b => b.foco && b.estacoes) || C.BAIRROS.find(b => b.estacoes) || {}).estacoes?.[0].id || C.PREDIOS[0].id;
const LIM = C.LIMITES, NASCER = [C.ruaDe(INICIO)[0] + 7.5, C.ruaDe(INICIO)[1]];   // nasce na rua em frente à primeira estação do bairro em foco
const A = { ativo: false, modo: 'boneco', v: 0, direcao: 0, yawCam: 0, desvioCam: 0, fator: 1, olho: { x: 0, y: 30, z: 0 }, pos: { x: NASCER[0], z: NASCER[1] }, y: 0.7, rumo: Math.PI / 2, fase: 0, vel: 0, yaw: -Math.PI / 2, pitch: 0.34, dist: 8, alvo: null };
const RAIO = 0.38, teclas = new Set(), joy = { x: 0, z: 0 };
const livre = (x, z) => { for (const s of solidos) if (Math.abs(x - s.x) < s.w / 2 + RAIO && Math.abs(z - s.z) < s.d / 2 + RAIO) return false; return x > LIM.x0 && x < LIM.x1 && z > LIM.z0 && z < LIM.z1; };
const livreR = (x, z, r) => { for (const s of solidos) if (Math.abs(x - s.x) < s.w / 2 + r && Math.abs(z - s.z) < s.d / 2 + r) return false; return x > LIM.x0 && x < LIM.x1 && z > LIM.z0 && z < LIM.z1; };
const carroCabe = (x, z, rumo) => { const sx = Math.sin(rumo), cz = Math.cos(rumo); return livreR(x, z, 0.8) && livreR(x + sx * 1.05, z + cz * 1.05, 0.72) && livreR(x - sx * 1.05, z - cz * 1.05, 0.72); };
function achaLivre(x, z) { if (livre(x, z)) return [x, z]; for (let r = 1; r < 14; r += 0.8) for (let a = 0; a < 6.28; a += 0.5) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (livre(px, pz)) return [px, pz]; } return [x, z]; }
const bairroEm = (x, z) => BAIRROS.find(b => Math.abs(x - b.c[0]) <= b.s[0] / 2 && Math.abs(z - b.c[1]) <= b.s[1] / 2);

function irPara(tipo, id) {
  let x, z;
  if (tipo === 'm' || tipo === 'g') { const q = tipo === 'm' ? C.CAIXA[id] : C.PORTAO[id]; x = q.p[0]; z = q.p[1] + (tipo === 'm' ? 2.4 : 0); }
  else { const e = tipo === 'p' ? id : (BAIRRO[id].estacoes ? BAIRRO[id].estacoes[0].id : INICIO), rua = C.ruaDe(e), pt = C.porta(e); x = pt[0] + (A.modo === 'boneco' ? 2 : 0); z = A.modo === 'boneco' ? pt[1] + 0.9 : rua[1] - 3; }   // a pé chega à porta; de carro ou câmera, à rua da frente
  if (A.modo === 'carro') { for (let r = 0; r < 16; r += 0.9) for (let a = 0; a < 6.28; a += 0.6) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (carroCabe(px, pz, Math.PI)) { A.pos.x = px; A.pos.z = pz; A.rumo = Math.PI; A.yawCam = 0; A.desvioCam = 0; A.v = 0; return; } } return; }
  if (A.modo === 'livre') { A.olho.x = x; A.olho.z = z + 22; A.olho.y = 16; A.yaw = 0; A.pitch = 0.45; return; }
  [A.pos.x, A.pos.z] = achaLivre(x, z); A.rumo = Math.PI; A.yaw = 0; A.pitch = 0.34; A.dist = 8;   // chega de frente para o prédio
}

// ---------- entrada ----------
const naoDigita = () => !(window.LeitorSpecs && window.LeitorSpecs.aberto()) && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
const MOVE = { Space: 1, KeyQ: 1, KeyC: 1, KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ShiftLeft: 1, ShiftRight: 1 };
window.addEventListener('keydown', (e) => { if (!A.ativo || !naoDigita()) return;
  if (MOVE[e.code]) { teclas.add(e.code); e.preventDefault(); } else if (e.code === 'KeyE' || e.code === 'Enter') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && e.code === 'Enter') return; e.preventDefault(); agir(); } else if (e.code === 'Escape') sair(); });
window.addEventListener('keyup', (e) => teclas.delete(e.code)); window.addEventListener('blur', () => teclas.clear());
const dedos = new Map(); let andou = 0;
const preso = () => document.pointerLockElement === canvas;
document.addEventListener('mousemove', (e) => { if (!A.ativo || !preso()) return; A.yaw -= e.movementX * 0.0024; A.pitch = Math.max(A.modo === 'livre' ? -1.45 : 0.04, Math.min(A.modo === 'livre' ? 1.45 : 1.25, A.pitch + e.movementY * 0.0022)); });
document.addEventListener('pointerlockchange', () => { if (!preso()) dedos.clear(); });
canvas.addEventListener('pointerdown', (e) => { if (!A.ativo) return; if (preso()) { agir(); return; } if (A.modo === 'livre' && e.pointerType === 'mouse') { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) {} } canvas.setPointerCapture(e.pointerId); dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); andou = 0; canvas.classList.add('arrasta'); canvas.focus({ preventScroll: true }); });
canvas.addEventListener('pointermove', (e) => { const d = A.ativo && dedos.get(e.pointerId); if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; andou += Math.abs(dx) + Math.abs(dy);
  if (preso()) return; if (A.modo === 'carro') { A.desvioCam -= dx * 0.0055; A.pitch = Math.max(0.06, Math.min(1.1, A.pitch + dy * 0.004)); return; } A.yaw -= dx * 0.0055; A.pitch = Math.max(A.modo === 'livre' ? -1.45 : 0.04, Math.min(A.modo === 'livre' ? 1.45 : 1.25, A.pitch + dy * 0.004)); });
const solta = (e) => { if (!dedos.delete(e.pointerId)) return; canvas.classList.remove('arrasta'); if (A.ativo && !preso() && andou < 6 && e.type === 'pointerup') { if (A.modo === 'livre') api.abrirAlvo(api.mirar()); else api.clicar(e); } };
canvas.addEventListener('pointerup', solta); canvas.addEventListener('pointercancel', solta);
canvas.addEventListener('wheel', (e) => { if (!A.ativo) return; e.preventDefault(); if (A.modo === 'livre') { A.ritmo = Math.max(0.3, Math.min(5, (A.ritmo || 1) * Math.exp(-e.deltaY * 0.0012))); return; } A.dist = Math.max(3, Math.min(26, A.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
// joystick de toque
const elJoy = $('#joy'), pino = elJoy.querySelector('i'); let joyId = null;
const joyMove = (e) => { const r = elJoy.getBoundingClientRect(), R = r.width / 2; let x = (e.clientX - r.left - R) / R, z = (e.clientY - r.top - R) / R; const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; } joy.x = x; joy.z = z; pino.style.transform = `translate(${x * R * 0.6}px, ${z * R * 0.6}px)`; };
elJoy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; elJoy.setPointerCapture(joyId); joyMove(e); e.preventDefault(); });
elJoy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
const joyFim = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy.x = joy.z = 0; pino.style.transform = ''; };
elJoy.addEventListener('pointerup', joyFim); elJoy.addEventListener('pointercancel', joyFim);

// ---------- interação por proximidade ----------
const elHud = $('#andar-hud'), elOnde = $('#a-onde'), elAgir = $('#a-agir');
function alvoPerto() { let melhor = null, dm = A.modo === 'carro' ? 5.2 : 3.4;
  for (const s of solidos) { if (!s.predio && !s.torre && !s.modulo) continue; const d = Math.hypot(Math.max(Math.abs(A.pos.x - s.x) - s.w / 2, 0), Math.max(Math.abs(A.pos.z - s.z) - s.d / 2, 0)); if (d < dm) { dm = d; melhor = s; } } return melhor; }
function agir() { if (A.modo === 'livre') { api.abrirAlvo(A.mira); return; } const s = A.alvo; if (!s) return; if (s.modulo) api.mostrarFicha('m', s.modulo); else if (s.torre) api.abrirSpecs(s.torre, null); else api.mostrarFicha('p', s.predio); }
elAgir.addEventListener('click', agir);
let ultimoAlvo, ultimoOnde;
function atualizarHud() {
  A.alvo = alvoPerto(); const chave = A.alvo ? (A.alvo.modulo ? 'm' + A.alvo.modulo : A.alvo.torre ? 't' + A.alvo.torre : 'p' + A.alvo.predio) : '';
  if (chave !== ultimoAlvo) { ultimoAlvo = chave; elAgir.hidden = !A.alvo;
    if (A.alvo) { if (A.alvo.modulo) elAgir.innerHTML = `<kbd>E</kbd> ${A.alvo.modulo} — ver o checklist na esteira`; else if (A.alvo.torre) { const b = BAIRRO[A.alvo.torre], r = api.resumoSpecs(b.id); elAgir.innerHTML = `<kbd>E</kbd> Ler as ${r.total + r.adrs} specs de ${b.nome}`; } else elAgir.innerHTML = `<kbd>E</kbd> ${PREDIO[A.alvo.predio].nome} — abrir a ficha`; } }
  const b = bairroEm(A.pos.x, A.pos.z), onde = b ? b.id : '';
  if (onde !== ultimoOnde) { ultimoOnde = onde; if (b) { const r = api.resumoSpecs(b.id); elOnde.innerHTML = `<i style="background:${hex(b.cor)}"></i>Você está em <b>${b.nome}</b><span>${r.total} specs · ${r.ok} aprovadas · ${r.an} em revisão</span>`; } else elOnde.innerHTML = '<i></i>Entre bairros<span>siga uma rua acesa: toda rua liga dois serviços</span>'; }
}

// ---------- minimapa ----------
const mini = $('#mini'), g = mini.getContext('2d'), MX0 = LIM.x0, MX1 = LIM.x1, MZ0 = LIM.z0, MZ1 = LIM.z1, esc = Math.min(mini.width / (MX1 - MX0), mini.height / (MZ1 - MZ0)), mx = (x) => (x - MX0) * esc, mz = (z) => (z - MZ0) * esc; let tMini = 0;
function desenharMini() {
  g.clearRect(0, 0, mini.width, mini.height); g.fillStyle = 'rgba(6,11,20,.9)'; g.fillRect(0, 0, mini.width, mini.height);
  g.lineWidth = 1; g.strokeStyle = 'rgba(126,168,220,.35)'; g.beginPath(); for (const r of Object.values(ROTAS)) r.pts.forEach(([x, z], i) => i ? g.lineTo(mx(x), mz(z)) : g.moveTo(mx(x), mz(z))); g.stroke();
  for (const b of BAIRROS) { g.fillStyle = hex(b.cor) + '44'; g.strokeStyle = hex(b.cor); g.fillRect(mx(b.x0), mz(b.z0), b.s[0] * esc, b.s[1] * esc); g.strokeRect(mx(b.x0), mz(b.z0), b.s[0] * esc, b.s[1] * esc); const t = torres[b.id]; g.fillStyle = '#fff'; g.fillRect(mx(t.x) - 1.5, mz(t.z) - 1.5, 3, 3); }
  g.save(); g.translate(mx(A.pos.x), mz(A.pos.z)); g.rotate(-A.rumo + Math.PI); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(0, 2.5); g.lineTo(-4, 5); g.closePath(); g.fill(); g.restore();
}

// ---------- quadro ----------
const elMira = $('#mira'); let tMira = 0, ultimaMira;
function quadroLivre(dt) {
  let ix = joy.x, iz = joy.z, iy = 0;
  if (naoDigita()) { if (teclas.has('KeyW') || teclas.has('ArrowUp')) iz -= 1; if (teclas.has('KeyS') || teclas.has('ArrowDown')) iz += 1; if (teclas.has('KeyA') || teclas.has('ArrowLeft')) ix -= 1; if (teclas.has('KeyD') || teclas.has('ArrowRight')) ix += 1; if (teclas.has('Space')) iy += 1; if (teclas.has('KeyQ') || teclas.has('KeyC')) iy -= 1; }
  const cp = Math.cos(A.pitch), sp = Math.sin(A.pitch), sy = Math.sin(A.yaw), cy = Math.cos(A.yaw), fx = -sy * cp, fy = -sp, fz = -cy * cp;   // para onde a câmera olha
  const v = (teclas.has('ShiftLeft') || teclas.has('ShiftRight') ? 75 : 26) * (A.ritmo || 1) * dt, o = A.olho;
  o.x += (fx * -iz + cy * ix) * v; o.y += (fy * -iz + iy) * v; o.z += (fz * -iz - sy * ix) * v;               // W voa na direção do olhar, como espectador
  o.x = Math.max(LIM.x0 - 80, Math.min(LIM.x1 + 80, o.x)); o.z = Math.max(LIM.z0 - 80, Math.min(LIM.z1 + 80, o.z)); o.y = Math.max(1.3, Math.min(260, o.y));
  camera.position.set(o.x, o.y, o.z); camera.lookAt(o.x + fx, o.y + fy, o.z + fz); A.pos.x = o.x; A.pos.z = o.z; A.fator = 1 + o.y / 22;
  tMira -= dt; if (tMira <= 0) { tMira = 0.12; A.mira = api.mirar(); if (A.mira && A.mira.dist > 160) A.mira = null; const chave = A.mira ? A.mira.t + A.mira.id + (A.mira.spec || '') : '';
    if (chave !== ultimaMira) { ultimaMira = chave; elAgir.hidden = !A.mira; if (A.mira) elAgir.innerHTML = `<kbd>E</kbd> ${A.mira.nome.replace(/[<>&]/g, '')}`; elMira.classList.toggle('alvo', !!A.mira); }
    const b = bairroEm(o.x, o.z), onde = (b ? b.id : '') + '|' + Math.round(o.y / 5); if (onde !== ultimoOnde) { ultimoOnde = onde; elOnde.innerHTML = `<i style="background:${b ? hex(b.cor) : ''}"></i>Câmera livre sobre <b>${b ? b.nome : 'a cidade'}</b><span>altura ${Math.round(o.y)} · ritmo ${(A.ritmo || 1).toFixed(1)}×</span>`; } }
  tMini -= dt; if (tMini <= 0) { tMini = 0.1; A.rumo = A.yaw + Math.PI; desenharMini(); }
}
// câmera em terceira pessoa, encurtada se houver prédio no caminho
function cameraAtras(hx, hy, hz, yaw, pitch, alcance, sobe) {
  const cp = Math.cos(pitch), ox = Math.sin(yaw) * cp, oy = Math.sin(pitch), oz = Math.cos(yaw) * cp; let dist = alcance;
  for (let t = 1.2; t <= alcance; t += 0.6) { const px = hx + ox * t, py = hy + oy * t, pz = hz + oz * t; let bate = false;
    for (const s of solidos) { if (Math.abs(px - s.x) < s.w / 2 + 0.3 && Math.abs(pz - s.z) < s.d / 2 + 0.3 && py < (s.predio ? vivos[s.predio].h : s.h) + 1) { bate = true; break; } } if (bate) { dist = Math.max(1.2, t - 0.6); break; } }
  camera.position.set(hx + ox * dist, hy + oy * dist, hz + oz * dist); camera.lookAt(hx, hy + sobe, hz);
}
function quadroCarro(dt, agora) {
  let acel = 0, vira = 0; const mao = teclas.has('Space');
  if (naoDigita()) { if (teclas.has('KeyW') || teclas.has('ArrowUp')) acel += 1; if (teclas.has('KeyS') || teclas.has('ArrowDown')) acel -= 1; if (teclas.has('KeyA') || teclas.has('ArrowLeft')) vira += 1; if (teclas.has('KeyD') || teclas.has('ArrowRight')) vira -= 1; }
  acel -= joy.z; vira -= joy.x; acel = Math.max(-1, Math.min(1, acel)); vira = Math.max(-1, Math.min(1, vira));
  const turbo = teclas.has('ShiftLeft') || teclas.has('ShiftRight'), vmax = turbo ? 46 : 30, freando = (acel < 0 && A.v > 0.6) || mao;
  if (acel > 0) A.v += (A.v < 0 ? 38 : 20 * (1 - Math.max(0, A.v) / (vmax * 1.15))) * acel * dt; else if (acel < 0) A.v += (A.v > 0.6 ? 40 : 12) * acel * dt;
  A.v -= A.v * (mao ? 2.6 : 0.55) * dt; if (acel === 0 && Math.abs(A.v) < 0.25) A.v = 0; A.v = Math.max(-9, Math.min(vmax, A.v));
  A.direcao += (vira - A.direcao) * Math.min(1, dt * 7);   // volante com peso; quanto mais rápido, menos esterça; freio de mão solta a traseira
  const giro = A.direcao * (mao ? 2.9 : 2.1) * Math.max(-1, Math.min(1, A.v / 7)) / (1 + Math.abs(A.v) * 0.035), rumoNovo = A.rumo + giro * dt;
  const nx = A.pos.x + Math.sin(rumoNovo) * A.v * dt, nz = A.pos.z + Math.cos(rumoNovo) * A.v * dt;
  if (carroCabe(nx, nz, rumoNovo)) { A.pos.x = nx; A.pos.z = nz; A.rumo = rumoNovo; } else if (carroCabe(A.pos.x, A.pos.z, rumoNovo) && Math.abs(A.v) < 4) { A.rumo = rumoNovo; A.v *= 0.5; } else { A.v *= -0.28; A.batida = agora; }
  const chaoY = C.alturaChao(A.pos.x, A.pos.z); A.y += (chaoY - A.y) * Math.min(1, dt * 9);
  carro.position.set(A.pos.x, A.y - 0.02, A.pos.z); carro.rotation.set(-Math.max(-0.05, Math.min(0.05, acel * 0.04)) * Math.sign(A.v || 1), A.rumo, A.direcao * Math.min(1, Math.abs(A.v) / 11) * 0.46);   // moto deita na curva
  for (const r of rodas) { r.roda.rotation.x += A.v * dt / 0.62; if (r.dianteira) r.eixo.rotation.y = A.direcao * 0.34; }
  if (Math.abs(A.v) > 0.6) moerRastro(A.pos.x, A.y - 0.02, A.pos.z); else if (rastro.length) moerRastro(A.pos.x, A.y - 0.02, A.pos.z);
  lantE.material.color.setHex(freando ? 0xff2a3c : 0x7a1420); lantD.material.color.setHex(freando ? 0xff2a3c : A.v < -0.3 ? 0xf2f6fb : 0x7a1420); neon.material.opacity = 0.26 + Math.min(0.3, Math.abs(A.v) / 90); trilha.material.opacity = 0.3 + Math.min(0.42, Math.abs(A.v) / 34);
  // câmera de perseguição: fica atrás do carro com atraso; arrastar o mouse gira em volta e volta sozinho ao andar
  if (Math.abs(A.v) > 2 && !dedos.size) A.desvioCam *= Math.max(0, 1 - dt * 1.6);
  let d = A.rumo + Math.PI - A.yawCam; d = Math.atan2(Math.sin(d), Math.cos(d)); A.yawCam += d * Math.min(1, dt * (3 + Math.abs(A.v) * 0.08)); A.yaw = A.yawCam + A.desvioCam;
  cameraAtras(A.pos.x, A.y + 1.3, A.pos.z, A.yaw, A.pitch, A.dist + Math.abs(A.v) * 0.09, 0.6); camera.fov += ((42 + Math.min(14, Math.abs(A.v) * 0.32)) - camera.fov) * Math.min(1, dt * 3); A.fator = 1.5;
  const perto = alvoPerto(), chave = perto ? (perto.modulo ? 'm' + perto.modulo : perto.torre ? 't' + perto.torre : 'p' + perto.predio) : ''; if (chave !== ultimoAlvo) { atualizarHud(); ultimoOnde = undefined; } else A.alvo = perto;
  const kmh = Math.round(Math.abs(A.v) * 3.6), b = bairroEm(A.pos.x, A.pos.z), onde = (b ? b.id : '') + kmh + (A.v < -0.3 ? 'r' : '');
  if (onde !== ultimoOnde) { ultimoOnde = onde; elOnde.innerHTML = `<i style="background:${b ? hex(b.cor) : ''}"></i>${b ? 'Dirigindo em <b>' + b.nome + '</b>' : 'Na estrada entre bairros'}<span class="vel"><b>${kmh}</b> km/h${A.v < -0.3 ? ' · ré' : turbo && acel > 0 ? ' · turbo' : ''}</span>`; }
  tMini -= dt; if (tMini <= 0) { tMini = 0.1; desenharMini(); }
}
function quadro(dt, agora) {
  if (A.modo === 'livre') return quadroLivre(dt); if (A.modo === 'carro') return quadroCarro(dt, agora);
  let ix = joy.x, iz = joy.z;
  if (naoDigita()) { if (teclas.has('KeyW') || teclas.has('ArrowUp')) iz -= 1; if (teclas.has('KeyS') || teclas.has('ArrowDown')) iz += 1; if (teclas.has('KeyA') || teclas.has('ArrowLeft')) ix -= 1; if (teclas.has('KeyD') || teclas.has('ArrowRight')) ix += 1; }
  const forca = Math.min(1, Math.hypot(ix, iz)), corre = teclas.has('ShiftLeft') || teclas.has('ShiftRight') || Math.hypot(joy.x, joy.z) > 0.92;
  const alvoVel = forca * (corre ? 17 : 8); A.vel += (alvoVel - A.vel) * Math.min(1, dt * 9);
  if (forca > 0.05) { const l = Math.hypot(ix, iz), s = Math.sin(A.yaw), c = Math.cos(A.yaw), vx = (ix * c + iz * s) / l, vz = (-ix * s + iz * c) / l;   // entrada relativa à câmera
    const nx = A.pos.x + vx * A.vel * dt, nz = A.pos.z + vz * A.vel * dt; if (livre(nx, A.pos.z)) A.pos.x = nx; if (livre(A.pos.x, nz)) A.pos.z = nz;
    let d = Math.atan2(vx, vz) - A.rumo; d = Math.atan2(Math.sin(d), Math.cos(d)); A.rumo += d * Math.min(1, dt * 12); }
  const chaoY = C.alturaChao(A.pos.x, A.pos.z); A.y += (chaoY - A.y) * Math.min(1, dt * 10);
  // animação: pernas e braços em oposição, tronco balança; parado, respira
  A.fase += dt * (2.2 + A.vel * 0.95); const amp = Math.min(1, A.vel / 8) * (corre ? 0.95 : 0.62), sw = Math.sin(A.fase) * amp;
  pernaE.rotation.x = sw; pernaD.rotation.x = -sw; bracoE.rotation.x = -sw * 0.9; bracoD.rotation.x = sw * 0.9; bracoE.rotation.z = 0.06; bracoD.rotation.z = -0.06;
  tronco.rotation.x = amp * 0.12; cabeca.position.y = 1.68 + (amp > 0.05 ? Math.abs(Math.cos(A.fase)) * 0.03 * amp : Math.sin(agora * 0.002) * 0.008);
  av.position.set(A.pos.x, A.y + (amp > 0.05 ? Math.abs(Math.cos(A.fase)) * 0.05 * amp : 0), A.pos.z); av.rotation.y = A.rumo; aro.material.opacity = 0.45 + Math.sin(agora * 0.004) * 0.2;
  cameraAtras(A.pos.x, A.y + 1.55, A.pos.z, A.yaw, A.pitch, A.dist, 0.25);
  atualizarHud(); tMini -= dt; if (tMini <= 0) { tMini = 0.1; desenharMini(); }
}

// ---------- entrar e sair ----------
const elAjuda = $('#a-ajuda'), BOTOES = { boneco: [$('#b-andar'), 'Andar pela cidade'], carro: [$('#b-carro'), 'Dirigir'], livre: [$('#b-livre'), 'Câmera livre'] };
const AJUDA = { boneco: 'W A S D ou setas para andar · Shift corre · arraste para olhar · roda aproxima · E interage · Esc volta à vista aérea · o botão Bairros teletransporta',
  carro: 'W acelera · S freia e dá ré · A D viram · Espaço é o freio de mão · Shift é o turbo · arraste para olhar em volta · E interage com o que estiver perto · Esc volta à vista aérea',
  livre: 'W voa para onde você olha · A D de lado · Espaço sobe · Q desce · Shift acelera · roda muda o ritmo · clique captura o mouse · E abre o que está na mira · Esc sai' };
function entrar(modo) {
  modo = modo || 'boneco'; const vinha = A.ativo ? A.modo : null; if (vinha === modo) return;
  if (modo === 'livre') { const d = new THREE.Vector3(); camera.getWorldDirection(d); A.olho.x = camera.position.x; A.olho.y = Math.max(2, camera.position.y); A.olho.z = camera.position.z; A.pitch = Math.asin(Math.max(-1, Math.min(1, -d.y))); A.yaw = Math.atan2(-d.x, -d.z); }
  else { if (vinha === 'livre') { A.pos.x = A.olho.x; A.pos.z = A.olho.z; } A.fator = 1;
    if (modo === 'carro') { let ok = carroCabe(A.pos.x, A.pos.z, A.rumo);   // o carro só nasce onde cabe: procura em volta, senão volta para a rua Recepção → Cálculo
      for (let r = 1; !ok && r < 18; r += 0.9) for (let a = 0; !ok && a < 6.28; a += 0.5) for (const rm of [A.rumo, Math.PI / 2, 0]) { const px = A.pos.x + Math.cos(a) * r, pz = A.pos.z + Math.sin(a) * r; if (carroCabe(px, pz, rm)) { A.pos.x = px; A.pos.z = pz; A.rumo = rm; ok = true; break; } }
      if (!ok) { A.pos.x = NASCER[0]; A.pos.z = NASCER[1]; A.rumo = Math.PI / 2; } A.v = 0; A.direcao = 0; A.yawCam = A.rumo + Math.PI; A.desvioCam = 0; A.pitch = 0.3; A.dist = 8.5; }
    else { if (vinha === 'carro') { const lx = A.pos.x + Math.cos(A.rumo) * 1.6, lz = A.pos.z - Math.sin(A.rumo) * 1.6; [A.pos.x, A.pos.z] = achaLivre(lx, lz); A.yaw = A.yawCam; } A.pitch = 0.34; A.dist = 8; [A.pos.x, A.pos.z] = achaLivre(A.pos.x, A.pos.z); } }
  if (document.pointerLockElement === canvas && modo !== 'livre') document.exitPointerLock();
  if (!A.ativo) { api.soltarSeguir(); api.fechaFicha(); $('#narra').hidden = true; }
  A.ativo = true; A.modo = modo; av.visible = modo !== 'carro' && (modo === 'boneco' || av.visible); if (modo === 'carro') carro.visible = true; else limparRastro(); if (modo !== 'carro') { camera.fov = 42; A.v = 0; }
  camera.near = 0.3; api.medirTela(); elHud.hidden = false; mini.hidden = false; elMira.hidden = modo !== 'livre'; elAgir.hidden = true;
  elJoy.hidden = !window.matchMedia('(pointer: coarse)').matches; app.classList.add('andando'); elAjuda.textContent = AJUDA[modo]; ultimoAlvo = ultimoOnde = ultimaMira = undefined;
  for (const [m, [b, rot]] of Object.entries(BOTOES)) { b.setAttribute('aria-pressed', String(m === modo)); b.textContent = m === modo ? 'Voltar à vista aérea' : rot; } canvas.focus({ preventScroll: true });
}
function sair() {
  if (!A.ativo) return; const x = A.modo === 'livre' ? A.olho.x : A.pos.x, z = A.modo === 'livre' ? A.olho.z : A.pos.z; A.ativo = false; A.fator = 1; A.v = 0; teclas.clear(); joy.x = joy.z = 0;
  if (document.pointerLockElement === canvas) document.exitPointerLock(); camera.near = 1; camera.fov = 42; api.medirTela(); elHud.hidden = true; mini.hidden = true; elJoy.hidden = true; elMira.hidden = true; app.classList.remove('andando');
  for (const [b, rot] of Object.values(BOTOES)) { b.setAttribute('aria-pressed', 'false'); b.textContent = rot; } api.olharPara(x, z, 120);
}
for (const [m, [b]] of Object.entries(BOTOES)) b.addEventListener('click', () => (A.ativo && A.modo === m ? sair() : entrar(m)));
for (const id of ['#b-cidade']) $(id).addEventListener('click', () => sair(), true);   // essas ações são da vista aérea

A.quadro = quadro; A.irPara = irPara; A.entrar = entrar; A.sair = sair; A.moto = carro; A.rastro = trilha; C.andar = A;
})();
