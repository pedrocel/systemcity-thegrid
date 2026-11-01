// SystemCity — parte 2: tráfego, simulação dos fluxos de todos os bairros, câmera, fichas, trilho e rótulos.
(() => {
'use strict';
const C = window.CID; if (!C) return;
const { $, app, canvas, renderer, scene, camera, M, CAT, BAIRROS, BAIRRO, PREDIOS, PREDIO, ROTAS, FLUXO, NASCE, alvos, vivos, torres, rnd, entre, hex, rgb } = C;
const SEM = { green: 0x5fd38d, yellow: 0xf4c542, red: 0xff5d6c, neutra: 0x9fd4ff };
const RGB = { green: rgb(SEM.green), yellow: rgb(SEM.yellow), red: rgb(SEM.red), neutra: rgb(SEM.neutra) }, BRANCO = [1, 1, 1];
const corBairro = Object.fromEntries(BAIRROS.map(b => [b.id, rgb(b.cor)]));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- pistas: cada rua tem duas mãos ----------
const cachePista = {};
function pista(id, inverso) {
  const chave = id + (inverso ? '<' : '>'); if (cachePista[chave]) return cachePista[chave];
  let pts = ROTAS[id].pts.map(([x, z]) => ({ x, z })); if (inverso) pts.reverse();
  pts = pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.01);
  const n = [], off = C.FAIXA || 0.62;   // cada mão anda no meio da sua faixa
  for (let i = 1; i < pts.length; i++) { const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z, l = Math.hypot(dx, dz); n.push({ x: -dz / l, z: dx / l }); }
  const P = pts.map((p, i) => { const a = n[Math.max(0, i - 1)], b = n[Math.min(n.length - 1, i)], k = off / Math.max(0.3, 1 + a.x * b.x + a.z * b.z); return { x: p.x + (a.x + b.x) * k, z: p.z + (a.z + b.z) * k }; });
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
  return cachePista[chave] = { P, L, total: L[L.length - 1] };
}
function posEm(pi, s, o) {
  const { P, L } = pi; if (s <= 0) { o.x = P[0].x; o.z = P[0].z; return; } if (s >= pi.total) { o.x = P[P.length - 1].x; o.z = P[P.length - 1].z; return; }
  let i = 1; while (L[i] < s) i++; const t = (s - L[i - 1]) / (L[i] - L[i - 1]); o.x = P[i - 1].x + (P[i].x - P[i - 1].x) * t; o.z = P[i - 1].z + (P[i].z - P[i - 1].z) * t;
}

// ---------- luzes em movimento ----------
const MAXP = 9000, aPos = new Float32Array(MAXP * 3), aCor = new Float32Array(MAXP * 3), aTam = new Float32Array(MAXP), geoP = new THREE.BufferGeometry();
for (const [nome, arr, n] of [['position', aPos, 3], ['cor', aCor, 3], ['tam', aTam, 1]]) { const at = new THREE.BufferAttribute(arr, n); at.setUsage(THREE.DynamicDrawUsage); geoP.setAttribute(nome, at); }
const matP = new THREE.ShaderMaterial({ uniforms: { escala: { value: 600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'attribute vec3 cor; attribute float tam; varying vec3 vCor; uniform float escala; void main(){ vCor = cor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(tam * escala / -mv.z, 2.0); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'varying vec3 vCor; void main(){ float d = length(gl_PointCoord - 0.5); float halo = smoothstep(0.5, 0.0, d); float miolo = smoothstep(0.17, 0.0, d); gl_FragColor = vec4(vCor * halo * halo * 1.15 + vec3(miolo) * 0.85 * max(max(vCor.r, vCor.g), vCor.b), 1.0); }' });
const pontos = new THREE.Points(geoP, matP); pontos.frustumCulled = false; scene.add(pontos);
const MAXO = 900, caixaEm = (w, h, d, y) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, 0); return g; }, basico = (cor) => new THREE.MeshBasicMaterial({ color: cor });
// o buffer de cor por instância é alocado pelo tamanho de `count` na hora do primeiro setColorAt: criar a cor ANTES de zerar a contagem
const inst = (geo, mat, colorido) => { const im = new THREE.InstancedMesh(geo, mat, MAXO); im.frustumCulled = false; if (colorido) im.setColorAt(0, new THREE.Color(1, 1, 1)); im.count = 0; im.userData.operarios = true; scene.add(im); alvos.push(im); return im; };
const imTronco = inst(caixaEm(0.56, 0.74, 0.34, 1.22), basico(0xffffff), true), imCabeca = inst(caixaEm(0.32, 0.32, 0.32, 1.76), basico(0xd9e3f0)), imCapacete = inst(caixaEm(0.42, 0.16, 0.46, 1.98), basico(0xffffff), true);
const geoMochila = caixaEm(0.44, 0.52, 0.22, 1.28); geoMochila.translate(0, 0, -0.29); const imMochila = inst(geoMochila, basico(0xffffff), true);
const geoBraco = caixaEm(0.16, 0.66, 0.18, -0.33), geoPerna = caixaEm(0.2, 0.86, 0.22, -0.43), matPerna = basico(0x22324f);
const imBracoE = inst(geoBraco, basico(0xffffff), true), imBracoD = inst(geoBraco, imBracoE.material, true), imPernaE = inst(geoPerna, matPerna), imPernaD = inst(geoPerna, matPerna);
const imsOp = [imTronco, imCabeca, imCapacete, imMochila, imBracoE, imBracoD, imPernaE, imPernaD], mapaOp = [];
const forma = (pts) => { const f = new THREE.Shape(); pts.forEach(([x, y], k) => (k ? f.lineTo(x, y) : f.moveTo(x, y))); f.closePath(); return new THREE.ShapeGeometry(f); };
const XIS = [[-0.4, -0.27], [-0.27, -0.4], [0, -0.13], [0.27, -0.4], [0.4, -0.27], [0.13, 0], [0.4, 0.27], [0.27, 0.4], [0, 0.13], [-0.27, 0.4], [-0.4, 0.27], [-0.13, 0]];
const MARCAS = { green: [new THREE.CircleGeometry(0.34, 20), SEM.green], yellow: [forma([[0, 0.42], [0.42, -0.32], [-0.42, -0.32]]), SEM.yellow], red: [forma(XIS), SEM.red], desvio: [forma([[0, 0.46], [0.4, 0], [0, -0.46], [-0.4, 0]]), 0xff8a5c] };
for (const k in MARCAS) { const im = new THREE.InstancedMesh(MARCAS[k][0], new THREE.MeshBasicMaterial({ color: MARCAS[k][1], side: THREE.DoubleSide }), MAXO); im.frustumCulled = false; im.count = 0; scene.add(im); MARCAS[k] = { im, n: 0 }; }
const vOlhar = new THREE.Vector3(), qMarca = new THREE.Quaternion(), mMarca = new THREE.Matrix4();
const mBase = new THREE.Matrix4(), mParte = new THREE.Matrix4(), mFim = new THREE.Matrix4(), vPos = new THREE.Vector3(), qRot = new THREE.Quaternion(), vEsc = new THREE.Vector3(), EIXO_Y = new THREE.Vector3(0, 1, 0), corOp = new THREE.Color(), o2 = { x: 0, z: 0 };
const rotaViva = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })); rotaViva.frustumCulled = false; rotaViva.visible = false; scene.add(rotaViva); let rotaDe = null;
const aneis = [];
for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); aneis.push({ m, t: 1 }); }
function anel(x, z, cor, raio) { const a = aneis.find(q => q.t >= 1) || aneis[0]; a.t = 0; a.raio = raio || 12; a.m.position.set(x, 0.9, z); a.m.material.color.setHex(cor); a.m.visible = true; }
const marca = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.13, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff })); marca.rotation.x = Math.PI / 2; marca.visible = false; scene.add(marca);

// ---------- simulação ----------
const EST = {}; for (const id of Object.keys(FLUXO)) EST[id] = { dentro: 0, passaram: 0, soma: 0 };
const CONC = { green: 812, yellow: 301, red: 171 }, viajantes = [], esperas = [], itens = new Set();
let T = 0, seq = 1180, seguindo = null, fimSeguir = 0, fichaOp = null;
function pulso(rota, inverso, cor, tam, fim) { if (!ROTAS[rota]) return; viajantes.push({ pi: pista(rota, inverso), s: 0, v: 22, cor, tam, cauda: 3, fim }); }
function idaEVolta(rota, corVolta, inverso, aoChegar) { pulso(rota, !!inverso, BRANCO, 1.5, () => { aoChegar && aoChegar(); pulso(rota, !inverso, corVolta, 2.1); }); }
function mover(n, rota, inverso, para) { n.saiuDe = n.dentro || n.saiuDe || null; n.dentro = null; n.indo = para; n.lado = (inverso ? ROTAS[rota].ladoDe : ROTAS[rota].ladoPara) || 'S'; viajantes.push({ pi: pista(rota, inverso), s: 0, v: 12, nota: n, tam: 2.8, cauda: 6, fim: () => entrar(n, para) }); }
const DIAG = M.diagnosticos || {}, sorteia = (l) => l[Math.floor(rnd() * l.length)];
const CANAIS = M.canais || [], DOCS = M.documentos || [], OPB = {}; for (const b of BAIRROS) if (b.operarios) OPB[b.id] = b.operarios;
const CANAL = {}, DOC = {}; for (const [b, o] of Object.entries(OPB)) { for (const x of o.origens) CANAL[x.id] = { ...x, bairro: b }; for (const x of o.tipos) DOC[x.id] = { ...x, bairro: b }; }
const porPeso = (l) => { let r = rnd() * l.reduce((a, x) => a + (x.peso || 0), 0); for (const x of l) { r -= x.peso || 0; if (r <= 0) return x; } return l[0]; };
const corCanal = Object.fromEntries(Object.values(CANAL).map(c => [c.id, rgb(c.cor)])), corDoc = Object.fromEntries(Object.values(DOC).map(d => [d.id, rgb(d.cor)])), APAGADO = [0.2, 0.25, 0.33], AMARELO = rgb(0xffd24a);
let lente = 'estado', filtro = null;   // lente: o que a cor mostra (estado · canal · doc); filtro: { tipo, id } isola um grupo
const estadoDe = (n) => (n.emDesvio ? 'desvio' : n.sem || 'outro');
const corEstado = (n) => (n.emDesvio ? RGB.red : n.sem ? RGB[n.sem] : corBairro[n.fluxo]);
const foraDoFiltro = (n) => !!filtro && (filtro.tipo === 'canal' ? n.canal !== filtro.id : filtro.tipo === 'doc' ? n.doc !== filtro.id : estadoDe(n) !== filtro.id);
const corDe = (n) => (foraDoFiltro(n) ? APAGADO : lente === 'canal' ? corCanal[n.canal] || APAGADO : lente === 'doc' ? corDoc[n.doc] || APAGADO : corEstado(n));

function novoOperario(g, tipoId) { const ops = OPB[g.bairro], t = ops ? (tipoId ? DOC[tipoId] : porPeso(ops.tipos)) : null;
  const n = { id: ++seq, fluxo: g.bairro, nome: t ? t.curto : g.nome, passos: (t && t.passos) || g.passos, desviou: {}, x: 0, z: 0, trilha: [], ...(t ? { doc: t.id, canal: t.origem || porPeso(ops.origens.filter(o => o.peso)).id } : {}), ...(g.op || {}) };
  itens.add(n); entrar(n, n.passos[0]); return n; }
function entrar(n, id) {
  const e = EST[id], p = PREDIO[id], f = FLUXO[id];
  if (p.tipo === 'estacao' && n.passos && !n.passos.includes(id) && f.prox) { n.x = p.p[0]; n.z = p.p[1]; const px = typeof f.prox === 'function' ? f.prox(n) : f.prox; mover(n, px.rota, false, px.para); return; } n.dentro = id; n.t0 = T; n.x = p.p[0]; n.z = p.p[1]; vivos[id].pulso = 1; { const ip = n.passos ? n.passos.indexOf(id) : -1; if (ip >= 0) n.passoAtual = ip; } n.indo = null; (n.trilha ??= []).push({ id, t: T }); if (n.trilha.length > 14) n.trilha.shift();
  n.motivo = p.tipo === 'desvio' ? (DIAG[id] ? sorteia(DIAG[id]) : { causa: p.desc }) : null; narrar(n, id);
  if (f.fim && !f.espera) { e.passaram++; CONC[n.sem || 'green']++; anel(p.p[0], p.p[1], SEM[n.sem || 'green'], 13); itens.delete(n); if (n === seguindo) fimSeguir = performance.now() + 3200; return; }
  e.dentro++;
  if (p.tipo === 'desvio') { n.emDesvio = true; anel(p.p[0], p.p[1], SEM.red, 9); }
  for (const r of f.chama || []) ROTAS[r] && idaEVolta(r, rgb(ROTAS[r].cor), false, () => { const d = vivos[ROTAS[r].para]; if (d) d.pulso = 1; });
  let esp = entre(...f.espera); if (n === seguindo) esp = Math.min(esp, p.tipo === 'desvio' ? 4.5 : 3.2);
  esperas.push({ n, id, resta: esp });
}
function sair(n, id) {
  const f = FLUXO[id], e = EST[id], p = PREDIO[id]; e.dentro--; e.passaram++; e.soma += T - n.t0;
  if (f.volta) { n.emDesvio = false; n.reprocessado = (n.reprocessado || 0) + 1; mover(n, f.volta.rota, f.volta.inverso, f.volta.para); return; }
  if (f.desvio && !n.desviou[id] && (n.forcar === f.desvio.id || (!n.limpa && !n.forcar && rnd() < f.desvio.p))) { n.desviou[id] = true; n.emDesvio = true; mover(n, f.desvio.rota, false, f.desvio.id); return; }
  if (p.semaforo && !n.sem) { const r = rnd(), s = p.semaforo; n.sem = r < (s.green ?? 0.7) ? 'green' : r < (s.green ?? 0.7) + (s.yellow ?? 0.2) ? 'yellow' : 'red'; if (n.sem !== 'green' && DIAG.apontamentos) n.apontamentos = [sorteia(DIAG.apontamentos.filter(a => a.cor === n.sem))]; }   // estação com semáforo: daqui o item sai verde, âmbar ou vermelho
  if (f.fim || (p.tipo === 'estacao' && n.passos && n.passos[n.passos.length - 1] === id)) { anel(p.p[0], p.p[1], BAIRRO[p.bairro].cor, 11); itens.delete(n); if (n === seguindo) fimSeguir = performance.now() + 3200; return; }
  const px = typeof f.prox === 'function' ? f.prox(n) : f.prox; mover(n, px.rota, false, px.para);
}
const AMBIENTE = (M.ambiente || []).map(a => ({ ...a, volta: a.volta != null ? rgb(a.volta) : null, so: a.so != null ? rgb(a.so) : null, t: rnd() * a.cada }));
const o = { x: 0, z: 0 };
function passo(dt) {
  T += dt;
  if (!window.SYSTEMCITY_AOVIVO) for (const g of NASCE) { g.t -= dt; if (g.t <= 0) { g.t += g.cada * entre(0.7, 1.3); novoOperario(g); } }
  for (const a of AMBIENTE) { a.t -= dt; if (a.t <= 0) { a.t += a.cada * entre(0.7, 1.3); a.so ? pulso(a.rota, false, a.so, 2.1) : idaEVolta(a.rota, a.volta, a.inverso); } }
  for (let i = viajantes.length - 1; i >= 0; i--) { const v = viajantes[i]; v.s += v.v * dt; if (v.nota) { posEm(v.pi, v.s, o); v.nota.x = o.x; v.nota.z = o.z; } if (v.s >= v.pi.total) { viajantes.splice(i, 1); v.fim && v.fim(); } }
  for (let i = esperas.length - 1; i >= 0; i--) { const w = esperas[i]; w.resta -= dt; if (w.resta <= 0) { esperas.splice(i, 1); sair(w.n, w.id); } }
}

// ---------- narração: o texto de cada passo é a descrição do prédio ----------
function narrar(n, id) { if (n !== seguindo) return; const lis = [...$('#n-passos').children], i = n.passos.indexOf(id), p = PREDIO[id];
  if (i >= 0) { n.passoAtual = i; lis.forEach((li, k) => { li.className = k < i ? 'ok' : k === i ? 'on' : ''; }); }
  else lis.forEach((li, k) => { li.className = k < (n.passoAtual ?? 0) ? 'ok' : k === (n.passoAtual ?? 0) ? 'on ruim' : ''; });     // fora da lista = desvio
  $('#n-txt').textContent = p ? `${p.tipo === 'desvio' ? 'Desvio — ' : ''}${p.nome}. ${p.desc || ''}` : ''; }
function seguirItem(n, titulo) {
  if (!n) return; if (C.andar && C.andar.ativo) C.andar.sair(); if (seguindo) pararSeguir(true);
  $('#n-passos').innerHTML = n.passos.map(k => `<li>${esc(PREDIO[k].nome)}</li>`).join('');
  seguindo = n; fimSeguir = 0; narrar(n, n.dentro || n.passos[n.passoAtual ?? 0]);
  $('#n-tit').textContent = titulo || `Seguindo um operário: ${n.nome}`; $('#n-id').textContent = `${n.nome} nº ${n.id}`;
  $('#narra').hidden = false; fechaFicha(); abrirMenuOp(false); voo = null; if (pausado) alternaPausa(); marca.visible = true;
}
function pararSeguir(silencio) { const b = seguindo && seguindo.fluxo; seguindo = null; fimSeguir = 0; marca.visible = false; $('#narra').hidden = true; ocioso = performance.now(); if (!silencio) voarBairro(b || BAIRROS[0].id); }

// menu "Seguir um operário": um item por fluxo da cidade
const nomesDe = (passos) => passos.filter(k => k !== 'origem').map(k => PREDIO[k].nome).join(' → ');
const FLUXOS_OP = [
  ...C.NASCE.flatMap(g => { const b = BAIRRO[g.bairro], ops = OPB[g.bairro];
    return ops ? ops.tipos.map(t => ({ grupo: b.nome, id: 'op-' + t.id, cor: t.cor, nome: t.nome, sub: nomesDe(t.passos || g.passos), criar: () => novoOperario(g, t.id) })) : [{ grupo: b.nome, id: 'op-' + g.em + '-' + g.nome, cor: (CANAL[(g.op || {}).canal] || b).cor, nome: g.nome, sub: nomesDe(g.passos), criar: () => novoOperario(g) }]; }),
];
const elMenuOp = $('#menu-op'), botaoOp = $('#b-operario');
elMenuOp.innerHTML = '<h2>Seguir um operário</h2><p>Cada dado que anda pela cidade é um operário identificado: o capacete diz o que ele é, a mochila diz de onde veio. Escolha um tipo para soltar um novo e acompanhar — ou clique em qualquer operário na rua.</p>' +
  FLUXOS_OP.map((f, k) => `${!k || FLUXOS_OP[k - 1].grupo !== f.grupo ? `<h3>${esc(f.grupo)}</h3>` : ''}<button class="tb" data-op="${esc(f.id)}" style="--cb:${hex(f.cor)}"><i></i><span>${esc(f.nome)}<small>${esc(f.sub)}</small></span></button>`).join('');
function abrirMenuOp(sim) { if (sim && !elLentes.hidden) abrirLentes(false); elMenuOp.hidden = !sim; botaoOp.setAttribute('aria-pressed', String(sim)); }
botaoOp.addEventListener('click', () => abrirMenuOp(elMenuOp.hidden));
elMenuOp.addEventListener('click', (e) => { const b = e.target.closest('[data-op]'); if (!b) return; const f = FLUXOS_OP.find(x => x.id === b.dataset.op); seguirItem(f.criar(), `Seguindo: ${f.nome}`); });

// ---------- câmera ----------
const LIM = C.LIMITES, MEIO = [(LIM.x0 + LIM.x1) / 2, (LIM.z0 + LIM.z1) / 2], RAIO_CIDADE = Math.max(LIM.x1 - LIM.x0, LIM.z1 - LIM.z0) * 0.92;
const cam = { alvo: new THREE.Vector3(MEIO[0], 0, MEIO[1]), raio: RAIO_CIDADE, theta: 0.52, phi: 0.88 };
let voo = null, ocioso = performance.now(), W = 1, H = 1, desvioX = 0;
const andando = () => !!(C.andar && C.andar.ativo);
const elFicha = $('#ficha'), calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function centrar(dt) { const largo = W > 860, gav = document.getElementById('trilho'), alvo = ((largo && !gav.hidden ? gav.offsetWidth + 16 : 0) - (largo && !elFicha.hidden ? elFicha.offsetWidth + 16 : 0)) / 2; desvioX += (alvo - desvioX) * Math.min(1, dt * 4); camera.setViewOffset(W, H, -desvioX, 0, W, H); }
function aplicarCam() { const sp = Math.sin(cam.phi); camera.position.set(cam.alvo.x + cam.raio * sp * Math.sin(cam.theta), cam.alvo.y + cam.raio * Math.cos(cam.phi), cam.alvo.z + cam.raio * sp * Math.cos(cam.theta)); camera.lookAt(cam.alvo); }
const folga = () => (W / H < 0.8 ? 1.75 : W / H < 1.25 ? 1.3 : 1);
function voar(x, z, raio, phi) { voo = { t: 0, de: { x: cam.alvo.x, z: cam.alvo.z, raio: cam.raio, phi: cam.phi }, para: { x, z, raio: raio * folga(), phi: phi || 0.92 } }; }
function voarBairro(id) { const b = BAIRRO[id]; voar(b.c[0], b.c[1] + 2, Math.max(b.s[0], b.s[1]) * 1.05 + 26); }
function voarCidade() { voar(MEIO[0], MEIO[1], RAIO_CIDADE, 0.88); }
const dedos = new Map(); let arrasto = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { if (andando()) return; canvas.setPointerCapture(e.pointerId); dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); arrasto = { andou: 0, pan: e.button === 2 || e.shiftKey }; canvas.classList.add('arrasta'); ocioso = performance.now(); esconderDica(); });
canvas.addEventListener('pointermove', e => {
  const d = dedos.get(e.pointerId); if (!d) { apontar(e); return; }
  const dx = e.clientX - d.x, dy = e.clientY - d.y; ocioso = performance.now();
  if (dedos.size === 2) { const [a, b] = [...dedos.values()], antes = Math.hypot(a.x - b.x, a.y - b.y); d.x = e.clientX; d.y = e.clientY; zoom(antes / (Math.hypot(a.x - b.x, a.y - b.y) || 1)); deslizar(dx / 2, dy / 2); if (arrasto) arrasto.andou += 9; return; }
  d.x = e.clientX; d.y = e.clientY; if (!arrasto) return; arrasto.andou += Math.abs(dx) + Math.abs(dy); voo = null;
  if (arrasto.pan) deslizar(dx, dy); else { cam.theta -= dx * 0.005; cam.phi = Math.max(0.18, Math.min(1.46, cam.phi - dy * 0.004)); }
});
const solta = e => { dedos.delete(e.pointerId); canvas.classList.remove('arrasta'); if (arrasto && arrasto.andou < 6 && e.type === 'pointerup') clicar(e); if (!dedos.size) arrasto = null; };
canvas.addEventListener('pointerup', solta); canvas.addEventListener('pointercancel', solta); canvas.addEventListener('pointerleave', () => { esconderDica(); sobre = null; });
canvas.addEventListener('wheel', e => { if (andando()) return; e.preventDefault(); zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012))); ocioso = performance.now(); }, { passive: false });
canvas.addEventListener('keydown', e => { if (andando()) return; const k = e.key; ocioso = performance.now();
  if (k === 'ArrowLeft') cam.theta += 0.08; else if (k === 'ArrowRight') cam.theta -= 0.08; else if (k === 'ArrowUp') cam.phi = Math.max(0.18, cam.phi - 0.06); else if (k === 'ArrowDown') cam.phi = Math.min(1.46, cam.phi + 0.06);
  else if (k === '+' || k === '=') zoom(0.88); else if (k === '-') zoom(1.14); else return; e.preventDefault(); voo = null; });
function zoom(f) { voo = null; cam.raio = Math.max(20, Math.min(RAIO_CIDADE * 1.5, cam.raio * f)); }
function deslizar(dx, dy) { if (seguindo) return; const k = cam.raio * 0.0016, c = Math.cos(cam.theta), s = Math.sin(cam.theta); cam.alvo.x = Math.max(LIM.x0, Math.min(LIM.x1, cam.alvo.x + (-c * dx - s * dy) * k)); cam.alvo.z = Math.max(LIM.z0, Math.min(LIM.z1, cam.alvo.z + (s * dx - c * dy) * k)); }

// ---------- apontar e clicar ----------
const raio = new THREE.Raycaster(), ndc = new THREE.Vector2(), elDica = $('#dica'), corTmp = new THREE.Color(); let sobre = null, escolhido = null, laminaAcesa = null;
function acertar(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raio.setFromCamera(ndc, camera); return raio.intersectObjects(alvos, false).find(h => h.object.visible) || null; }
function apagarLamina() { if (!laminaAcesa) return; const { t, i } = laminaAcesa, s = t.itens[i]; t.im.setColorAt(i, corTmp.setHex(s.natureza === 'adr' ? C.COR_ADR : C.COR_CLASSE[s.classe])); t.im.instanceColor.needsUpdate = true; laminaAcesa = null; }
function esconderDica() { elDica.hidden = true; apagarLamina(); }
const e2x = (e, r) => e.clientX - r.left + 14;
function apontar(e0) {
  const e = e0, h = acertar(e), u = h && h.object.userData; sobre = u && u.predio || null; canvas.classList.toggle('aponta', !!u);
  if (u && u.torre && h.instanceId != null) { const t = torres[u.torre], s = t.itens[h.instanceId];
    if (!laminaAcesa || laminaAcesa.t !== t || laminaAcesa.i !== h.instanceId) { apagarLamina(); t.im.setColorAt(h.instanceId, corTmp.setHex(0xffffff)); t.im.instanceColor.needsUpdate = true; laminaAcesa = { t, i: h.instanceId }; }
    elDica.innerHTML = `<b>${esc(s.titulo)}</b><span>${s.natureza === 'adr' ? 'ADR' : 'Spec'} · ${esc(s.status || 'sem status')}${s.rn ? ` · ${s.rn} RN` : ''} · clique para ler</span>`; elDica.hidden = false;
    const r = app.getBoundingClientRect(); elDica.style.transform = `translate(${Math.min(e.clientX - r.left + 14, W - 300)}px, ${e.clientY - r.top + 14}px)`;
  } else if (u && u.operarios && mapaOp[h.instanceId]) { const n = mapaOp[h.instanceId]; apagarLamina(); elDica.innerHTML = `<b>${esc(n.nome)} nº ${n.id}</b><span>${n.dentro ? 'esperando em ' + esc(PREDIO[n.dentro].nome) : 'a caminho'}${n.emDesvio ? ' · em desvio' : ''} · clique para ver quem é</span>`; elDica.hidden = false;
    const r = app.getBoundingClientRect(); elDica.style.transform = `translate(${Math.min(e2x(e0, r), W - 300)}px, ${e0.clientY - r.top + 14}px)`;
  } else if (u && u.modulo) { const m = C.CAIXA[u.modulo], e = m.etapas[m.etapaAtual - 1]; apagarLamina();
    elDica.innerHTML = `<b>${esc(m.slug)}</b><span>etapa ${m.etapaAtual} · ${esc(e.nome)} · ${e.feitos}/${e.total} itens · clique para o checklist</span>`; elDica.hidden = false;
    const r = app.getBoundingClientRect(); elDica.style.transform = `translate(${Math.min(e2x(e0, r), W - 300)}px, ${e0.clientY - r.top + 14}px)`;
  } else esconderDica();
}
function clicar(e) { const h = acertar(e), u = h && h.object.userData; if (!u) return;
  if (u.operarios) { const n = mapaOp[h.instanceId]; if (n) verOperario(n); return; }
  if (u.predio === 'es-portal-grid' && C.central3d) { C.central3d.entrar(); return; }
  if (u.bugPredio) { if (C.bugs) C.bugs.abrir(u.bugPredio); return; }
  if (u.obra) { if (C.gerente) C.gerente.abrir(u.obra); return; }
  if (u.modulo) return escolher('m', u.modulo); if (u.portao) return escolher('g', u.portao);
  if (u.torre) { const t = torres[u.torre]; abrirSpecs(u.torre, h.instanceId != null ? t.itens[h.instanceId].id : null); } else u.predio ? escolher('p', u.predio) : escolher('b', u.bairro); }
function abrirSpecs(bairro, alvo) { if (!window.LeitorSpecs) return; esconderDica(); const b = BAIRRO[bairro]; window.LeitorSpecs.abrir(bairro, alvo, b.nome, hex(b.cor)); }
function mostrarFicha(tipo, id) { escolhido = tipo + ':' + id; desenharTrilho(); abreFicha(); }
function escolher(tipo, id) {
  if (seguindo) pararSeguir(true); mostrarFicha(tipo, id);
  if (andando()) { C.andar.irPara(tipo, id); return; }
  if (tipo === 'm' || tipo === 'g') { const q = tipo === 'm' ? C.CAIXA[id] : C.PORTAO[id]; voar(q.p[0], q.p[1], 46, 1.0); return; }
  if (tipo === 'b') voarBairro(id); else { const p = PREDIO[id]; voar(p.p[0], p.p[1], p.ext ? 95 : 58, 1.0); }
}

// ---------- ficha ----------
const fmt = (n) => Math.round(n).toLocaleString('pt-BR'), seg = (s) => s ? s.toFixed(1).replace('.', ',') + ' s' : '—';
const specsDe = (b) => (CAT.bairros[b] || []);
function acharSpec(slug, bairro) { if (!slug) return null; const em = (b) => specsDe(b).find(s => s.slug === slug && s.natureza === 'spec'); let s = em(bairro); if (s) return s; for (const b of Object.keys(CAT.bairros)) { s = em(b); if (s) return s; } return null; }
function resumoSpecs(b) { const l = specsDe(b), sp = l.filter(s => s.natureza === 'spec'), c = (k) => sp.filter(s => s.classe === k).length, ok = c('ok'), an = c('andamento'), sem = sp.length - ok - an;
  return { total: sp.length, adrs: l.length - sp.length, ok, an, sem, rn: sp.reduce((n, s) => n + s.rn, 0) }; }
const MODS = C.ESTEIRA.modulos, SINAL = { feito: '✓', parcial: '~', falta: '✗' };
const botaoMod = (m, extra) => `<button class="mod" data-mod="${esc(m.slug)}" style="--c:${hex((BAIRRO[m.bairro] || BAIRRO.esteira).cor)}"><i></i><span>${esc(m.slug)}</span><em>${extra}</em></button>`;
function fichaModulo(m) { const b = BAIRRO[m.bairro], s = acharSpec(m.slug, m.bairro);
  return `<div class="tipo" style="--cb:${hex(BAIRRO.esteira.cor)}">Módulo na esteira · estado lido do repositório</div><h3>${esc(m.slug)}</h3><div class="sub">${esc(m.caminho)}</div>
    ${m.preEsteira ? `<div class="diag" style="--c:#8aa0bb"><p><b>Anterior à esteira.</b> Esta pasta nasceu em ${esc(m.nasceu.split('-').reverse().join('/'))}, antes de a esteira v2 ser formalizada (03/09/2026). O módulo nunca passou por ela: os itens de demanda aparecem como falta porque esses artefatos ainda não existiam — é origem, não atraso.</p></div>` : ''}
    ${m.ramo ? `<div class="diag" style="--c:#e0b050"><p><b>Ainda em branch.</b> Este módulo só existe em <code>${esc(m.ramo)}</code> e ainda não chegou à dev. O estado abaixo foi lido dessa branch.</p></div>` : ''}
    <p>${m.preEsteira ? 'Se entrasse hoje, estaria' : 'Está'} na <b>etapa ${m.etapaAtual} — ${esc(m.etapas[m.etapaAtual - 1].nome)}</b>${b ? `, e pertence ao bairro <b style="color:${hex(b.cor)}">${esc(b.nome)}</b>` : ''}. Status da spec: ${esc(m.statusSpec || 'não declarado')}.</p>
    <p class="nota">Pendências no questionário — eng. de contexto: ${m.pendencias.contexto} · arquiteto: ${m.pendencias.arquiteto} · fora da POC: ${m.pendencias.foraDaPoc}</p>
    ${m.etapas.map(e => `<details class="etp" ${e.n === m.etapaAtual ? 'open' : ''}><summary><span>${e.n}. ${esc(e.nome)}</span><em>${e.feitos}/${e.total}${e.gate ? (e.gatePassou ? ' · gate ✓' : ' · gate ✗') : ''}</em></summary>
      <div class="barra-p"><i style="width:${e.total ? e.feitos / e.total * 100 : 0}%;--c:${e.gatePassou ? 'var(--verde)' : 'var(--ambar)'}"></i></div>
      <ul class="chk">${e.itens.map(i => `<li class="${i.estado === 'feito' ? 'feito' : i.estado === 'parcial' ? 'parcial' : 'falta'}"><b>${SINAL[i.estado] || '✗'}</b><span>${esc(i.item)}</span>${i.dono && i.estado !== 'feito' ? `<small>${esc(i.dono)}</small>` : ''}</li>`).join('')}</ul></details>`).join('')}
    ${m.fatias.length ? `<details class="etp" open><summary><span>Contextos de dev (fatias)</span><em>${m.fatias.filter(f => f.entregue).length}/${m.fatias.length} entregues</em></summary><ul class="chk">${m.fatias.map(f => `<li class="${f.entregue ? 'feito' : 'falta'}"><b>${f.entregue ? '✓' : '○'}</b><span>${esc(f.n)} · ${esc(f.titulo)}</span>${f.rn ? `<small>${esc(f.rn.slice(0, 18))}</small>` : ''}</li>`).join('')}</ul></details>` : '<p class="nota">Este módulo ainda não tem contexto de dev por fatia.</p>'}
    <p class="nota">${m.adrs} ADRs · ${m.perguntas} perguntas no questionário · ${m.prototipos} protótipo(s) · validação do PO: ${m.tem.validacaoPo ? 'gravada' : 'não gravada'} · teste de carga: ${m.tem.testesCarga ? 'gravado' : 'não gravado'}</p>
    ${s ? `<button class="bt cheio" data-specs="${s.bairro}" data-spec="${esc(s.id)}"><small>Spec deste módulo</small>${esc(s.titulo)}<em style="--c:${hex(C.COR_CLASSE[s.classe])}">${esc(s.status || 'sem status')}</em></button>` : ''}`; }
function fichaGate(g) { const perto = [...MODS].sort((x, y) => y.etapas[g.etapa - 1].feitos / y.etapas[g.etapa - 1].total - x.etapas[g.etapa - 1].feitos / x.etapas[g.etapa - 1].total).slice(0, 6);
  return `<div class="tipo" style="--cb:${hex(g.cor)}">Gate da esteira</div><h3>${esc(g.titulo)}</h3><div class="sub">quem passa: ${esc(g.quem)}</div><p>${esc(g.desc)}</p>
    <div class="medidas" style="--cb:${hex(g.cor)}"><div><strong>${g.passou}</strong><small>módulos já passaram</small></div><div><strong>${MODS.filter(m => !m.preEsteira).length}</strong><small>nasceram dentro da esteira</small></div><div><strong>${MODS.filter(m => m.preEsteira).length}</strong><small>são anteriores a ela</small></div></div>
    <p class="nota">Quem está mais perto de passar, pelos itens da etapa ${g.etapa}:</p><div class="mods">${perto.map(m => botaoMod(m, `${m.etapas[g.etapa - 1].feitos}/${m.etapas[g.etapa - 1].total}`)).join('')}</div>`; }
const nomePasso = (n, id) => ((PREDIO[id] || {}).nome || id);
const blocoDiag = (d) => `<div class="diag" style="--c:${d.cor ? hex(SEM[d.cor]) : 'var(--rubi)'}"><p>${esc(d.causa)}</p>${d.resolver ? `<dl><dt>Como resolve</dt><dd>${esc(d.resolver)}</dd><dt>Quem resolve</dt><dd>${esc(d.lado)}</dd></dl>` : ''}${d.cod ? `<small>diagnóstico ${esc(d.cod)} do catálogo do painel · sorteado nesta maquete</small>` : ''}</div>`;
function vivoOperario(n) {
  const vivo = itens.has(n), p = n.dentro ? PREDIO[n.dentro] : null, parado = p ? T - n.t0 : 0, desvio = p && p.tipo === 'desvio', conf = n.passos.includes('calculo');
  const glifo = { green: '● ', yellow: '▲ ', red: '✕ ', desvio: '◆ ' }[estadoDe(n)] || '';
  const situacao = !vivo ? ['Concluiu o percurso', 'var(--verde)'] : desvio ? [`${glifo}Parado em desvio: ${p.nome}`, 'var(--rubi)'] : p ? [`${glifo}Parado em ${nomePasso(n, n.dentro)}`, 'var(--ambar)'] : [`${glifo}Andando para ${nomePasso(n, n.indo)}`, 'var(--marca)'];
  let h = `<div class="op-status" style="--c:${situacao[1]}"><b>${esc(situacao[0])}</b>${p && vivo ? `<span>há ${seg(parado)}</span>` : ''}</div>`;
  // por que parou
  if (vivo && p) { h += '<h4>Por que parou</h4>';
    if (desvio) h += blocoDiag(n.motivo || { causa: p.desc });
    else { const outros = Math.max(0, (EST[n.dentro] ? EST[n.dentro].dentro : 1) - 1); h += `<p>Está sendo atendido nesta estação${outros ? `, com mais ${outros} na mesma fila` : ''}. ${esc(p.desc.split('. ')[0])}.</p>`; } }
  else if (vivo) h += `<h4>Por que parou</h4><p>Não está parado: saiu de ${esc(nomePasso(n, n.saiuDe || 'origem'))} e caminha para ${esc(nomePasso(n, n.indo))}.</p>`;
  // que problema carrega
  h += '<h4>Problema que carrega</h4>';
  if (n.apontamentos && n.apontamentos.length) h += n.apontamentos.map(blocoDiag).join('');
  else if (conf && !n.sem) h += '<p>Ainda não passou pelo Cálculo: ninguém conferiu os tributos, então não tem cor nem apontamento.</p>';
  else if (conf) h += '<p>Nenhum: saiu verde do Cálculo, sem apontamento.</p>';
  else h += `<p>${desvio ? 'O do desvio acima.' : 'Nenhum registrado neste fluxo.'}</p>`;
  if (n.reprocessado) h += `<p class="nota">Já passou por desvio e foi reprocessado ${n.reprocessado} vez${n.reprocessado > 1 ? 'es' : ''}.</p>`;
  // de onde veio e para onde vai
  const tri = [...(n.trilha || [])].reverse().slice(0, 7), ia = n.passoAtual ?? -1, faltam = n.passos.slice(ia + (p || !vivo ? 1 : n.indo && n.passos.indexOf(n.indo) === ia ? 0 : 1));
  h += `<h4>De onde veio</h4><ol class="trilha">${tri.map((x, k) => `<li class="${(PREDIO[x.id] || {}).tipo === 'desvio' ? 'ruim' : ''}"><span>${esc(nomePasso(n, x.id))}</span><em>${k === 0 && p ? 'agora' : 'há ' + seg(T - x.t)}</em></li>`).join('') || '<li><span>acabou de nascer</span></li>'}</ol>`;
  h += `<h4>Para onde vai</h4>${!vivo ? '<p>Terminou: chegou ao fim do fluxo.</p>' : `<p>${desvio ? `Depois do desvio volta para <b>${esc(nomePasso(n, FLUXO[n.dentro].volta.para))}</b>. ` : n.indo ? `Agora: <b>${esc(nomePasso(n, n.indo))}</b>. ` : ''}Destino final: <b>${esc(nomePasso(n, n.passos[n.passos.length - 1]))}</b>.</p>${faltam.length ? `<p class="nota">Ainda faltam: ${faltam.map(x => esc(nomePasso(n, x))).join(' → ')}</p>` : ''}`}`;
  return h;
}
function fichaOperario(n) { const b = BAIRRO[n.fluxo] || BAIRROS[0], cor = n.emDesvio ? SEM.red : n.sem ? SEM[n.sem] : b.cor;
  return `<div class="tipo" style="--cb:${hex(cor)}">Operário · ${esc(b.nome)}</div><h3>${esc(n.nome)} nº ${n.id}</h3><div class="sub">fluxo: ${n.passos.filter(x => x !== 'origem').map(x => esc(nomePasso(n, x))).join(' → ')}</div>
    ${CANAL[n.canal] ? `<h4>${CANAL[n.canal].sentido === 'saida' ? 'Como sai — transmissão' : CANAL[n.canal].sentido ? 'Como entrou — captura' : 'De onde parte — origem'}</h4><div class="diag" style="--c:${hex(CANAL[n.canal].cor)}"><p><b>${esc(CANAL[n.canal].nome)}</b> · mochila nesta cor</p><p style="margin-top:5px">${esc(CANAL[n.canal].desc)}</p></div>` : ''}${DOC[n.doc] ? `<h4>O que ele é</h4><div class="diag" style="--c:${hex(DOC[n.doc].cor)}"><p><b>${esc(DOC[n.doc].nome)}</b> · capacete nesta cor</p><p style="margin-top:5px">${esc(DOC[n.doc].desc)}</p></div>` : ''}
    <div id="f-op-vivo">${vivoOperario(n)}</div>
    <button class="bt forte cheio" data-seguir>Seguir este operário</button>${n.dentro || n.indo ? `<button class="bt cheio" data-predio="${esc(n.dentro || n.indo)}"><small>Estação onde ${n.dentro ? 'está' : 'vai chegar'}</small>${esc(nomePasso(n, n.dentro || n.indo))}</button>` : ''}
    <p class="nota">Operário simulado: o percurso e os tempos são da maquete. Os motivos de parada vêm dos diagnósticos da cidade.</p>`; }
function verOperario(n) { if (!n) return; if (seguindo && seguindo !== n) pararSeguir(true); fichaOp = n; escolhido = 'o:' + n.id; desenharTrilho(); abreFicha(); if (!andando() && !seguindo) voar(n.vx ?? n.x, n.vz ?? n.z, 40, 0.95); }
function fechaFicha() { elFicha.hidden = true; escolhido = null; fichaOp = null; desenharTrilho(); }
function abreFicha() {
  elFicha.hidden = false; let h = '';
  if (!escolhido) { const tot = BAIRROS.reduce((a, b) => { const r = resumoSpecs(b.id); a.s += r.total; a.a += r.adrs; return a; }, { s: 0, a: 0 });
    h += `<div class="tipo">Como ler a cidade</div><h3>Um sistema que se comporta como cidade</h3>
      <p>Cada <b>bairro</b> é um módulo da plataforma, com as estações do fluxo dele em ordem. As <b>ruas têm duas mãos</b>: o pedido vai por uma, a resposta volta pela outra. Prédio <b>cresce</b> quando a fila dentro dele aumenta; desvio é vermelho.</p>
      <p>Em cada bairro há uma <b>torre de specs</b>: uma lâmina por documento, verde se aprovada ou implementada, âmbar se em revisão, cinza sem status, lilás para decisão de arquitetura. Passe o mouse para ver o título; <b>clique para ler</b>.</p>
      <div class="medidas"><div><strong>${fmt(tot.s)}</strong><small>specs no catálogo</small></div><div><strong>${fmt(tot.a)}</strong><small>decisões (ADR)</small></div><div><strong>${BAIRROS.length}</strong><small>bairros</small></div></div>
      <p class="nota">Arraste para girar · Shift + arraste (ou dois dedos) para deslizar · role para aproximar · clique num prédio, bairro ou lâmina.</p>
      <p class="nota">O tráfego é simulado e os números de fila são fictícios. ${CAT.geradoEm ? `Documentos lidos em ${esc(new Date(CAT.geradoEm).toLocaleString('pt-BR'))}.` : ''}</p>`;
  } else { const [t, id] = escolhido.split(':');
    if (t === 'o') h += fichaOp ? fichaOperario(fichaOp) : ''; else if (t === 'm') h += fichaModulo(C.CAIXA[id]); else if (t === 'g') h += fichaGate(C.PORTAO[id]); else
    if (t === 'b') { const b = BAIRRO[id], r = resumoSpecs(id);
      h += `<div class="tipo" style="--cb:${hex(b.cor)}">Bairro</div><h3>${esc(b.nome)}</h3><div class="sub">${esc(b.repos)}</div><p>${esc(b.desc)}</p>
        <div class="medidas"><div><strong style="color:var(--verde)">${r.ok}</strong><small>specs aprovadas ou implementadas</small></div><div><strong style="color:var(--ambar)">${r.an}</strong><small>em revisão ou rascunho</small></div><div><strong>${r.sem}</strong><small>sem status declarado</small></div></div>
        ${r.total ? `<div class="mix"><i style="flex:${r.ok};background:var(--verde)"></i><i style="flex:${r.an};background:var(--ambar)"></i><i style="flex:${r.sem};background:#6b7f99"></i></div>` : ''}
        <p class="nota">${r.total} specs · ${r.adrs} ADRs · ${fmt(r.rn)} regras de negócio numeradas</p>
        <button class="bt" data-fluxo-bairro="${esc(id)}" style="margin-top:12px;width:100%">Ver o fluxo deste bairro</button>
        <button class="bt forte cheio" data-specs="${id}">Abrir as specs deste bairro</button>`;
      const meus = b.patio ? MODS : MODS.filter(m => m.bairro === id); if (meus.length) h += `<p class="nota">${b.patio ? 'Módulos na esteira' : 'Módulos deste bairro na esteira'} (${meus.length}) — etapa em que cada um está:</p><div class="mods">${meus.map(m => botaoMod(m, 'etapa ' + m.etapaAtual)).join('')}</div>`; }
    else { const p = PREDIO[id], cor = hex(vivos[id].cor), s = acharSpec(p.fonte, p.bairro);
      const rot = { estacao: p.n ? `Estação ${p.n} · ${p.bairro ? BAIRRO[p.bairro].nome : ''}` : 'Estação', desvio: 'Desvio', servico: 'Serviço', externo: p.n ? `Mundo de fora · estação ${p.n} "No ERP"` : 'Mundo de fora' }[p.tipo];
      h += `<div class="tipo" style="--cb:${cor}">${esc(rot)}</div><h3>${esc(p.nome)}</h3>${p.subn ? `<div class="sub">${esc(p.subn)}</div>` : ''}<p>${esc(p.desc)}</p>`;
      if (p.entrega) { const tf = MODS.reduce((n, m) => n + m.fatias.length, 0), te = MODS.reduce((n, m) => n + m.fatias.filter(f => f.entregue).length, 0), vp = MODS.filter(m => m.tem.validacaoPo).length;
        h += `<div class="medidas" style="--cb:${cor}"><div><strong>${tf}</strong><small>contextos de dev (fatias) escritos</small></div><div><strong style="color:var(--verde)">${te}</strong><small>fatias entregues</small></div><div><strong style="color:${vp ? 'var(--verde)' : 'var(--rubi)'}">${vp}</strong><small>POCs com validação do PO gravada</small></div></div>`; }
      if (p.artefatos) h += `<dl><dt>Sai desta etapa</dt><dd>${p.artefatos.map(a => `<span class="chip">${esc(a)}</span>`).join('')}</dd></dl>`;
      const patio = noPatio(id);
      if (patio) h += `${p.dono ? `<dl><dt>Dono da etapa</dt><dd>${esc(p.dono)}</dd></dl>` : ''}<p class="nota">${patio.length ? `No pátio desta etapa (${patio.length}) — itens cumpridos aqui:` : 'Nenhum módulo chegou a esta etapa ainda.'}</p><div class="mods">${patio.map(m => botaoMod(m, `${m.etapas[p.n - 1].feitos}/${m.etapas[p.n - 1].total}`)).join('')}</div>`;
      else if (EST[id]) h += `<div class="medidas" style="--cb:${cor}" id="f-medidas"></div><div class="mix" id="f-mix"></div>`;
      h += `<dl>${p.st ? `<dt>Estados</dt><dd>${p.st.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</dd>` : ''}${p.entra ? `<dt>Entra de</dt><dd>${esc(p.entra)}</dd>` : ''}${p.sai ? `<dt>Sai para</dt><dd>${esc(p.sai)}</dd>` : ''}${p.desvio ? `<dt>Se der errado</dt><dd>${esc(p.desvio)}</dd>` : ''}</dl>`;
      if (s) h += `<button class="bt cheio" data-specs="${s.bairro}" data-spec="${esc(s.id)}"><small>Spec que governa esta estação</small>${esc(s.titulo)}<em style="--c:${hex(C.COR_CLASSE[s.classe])}">${esc(s.status || 'sem status')}</em></button>`; } }
  elFicha.innerHTML = `<button class="fecha" aria-label="Fechar">×</button><div class="rolo">${h}</div><div class="puxador" data-canto="so" title="Arraste para redimensionar · duplo clique volta ao tamanho original"></div>`; elFicha.querySelector('.fecha').addEventListener('click', fechaFicha);
  elFicha.querySelectorAll('[data-seguir]').forEach(b => b.addEventListener('click', () => seguirItem(fichaOp)));
  elFicha.querySelectorAll('[data-predio]').forEach(b => b.addEventListener('click', () => escolher('p', b.dataset.predio)));
  elFicha.querySelectorAll('[data-mod]').forEach(b => b.addEventListener('click', () => escolher('m', b.dataset.mod)));
  elFicha.querySelectorAll('[data-fluxo-bairro]').forEach(b => b.addEventListener('click', () => { if (C.fluxo) C.fluxo.abrir(b.dataset.fluxoBairro); }));
  elFicha.querySelectorAll('[data-specs]').forEach(b => b.addEventListener('click', () => abrirSpecs(b.dataset.specs, b.dataset.spec || null))); medir();
}
function medir() { if (fichaOp && escolhido === 'o:' + fichaOp.id) { const v = $('#f-op-vivo'); if (v) v.innerHTML = vivoOperario(fichaOp); return; }
  const m = $('#f-medidas'); if (!m || !escolhido) return; const id = escolhido.split(':')[1], e = EST[id];
  if (id === 'concluida') { const tot = CONC.green + CONC.yellow + CONC.red;
    m.innerHTML = `<div><strong style="color:var(--verde)">${fmt(CONC.green)}</strong><small>sem apontamento</small></div><div><strong style="color:var(--ambar)">${fmt(CONC.yellow)}</strong><small>atenção</small></div><div><strong style="color:var(--rubi)">${fmt(CONC.red)}</strong><small>com apontamento</small></div>`;
    $('#f-mix').innerHTML = ['green', 'yellow', 'red'].map(k => `<i style="flex:${CONC[k] / tot};background:${hex(SEM[k])}"></i>`).join(''); return; }
  m.innerHTML = `<div><strong>${fmt(e.dentro)}</strong><small>paradas aqui agora</small></div><div><strong>${fmt(e.passaram)}</strong><small>já passaram</small></div><div><strong>${seg(e.passaram ? e.soma / e.passaram : 0)}</strong><small>parada média</small></div>`; }

// ---------- trilho ----------
const trilho = $('#trilho-lista'), gaveta = $('#trilho'), botaoBairros = $('#b-bairros');
function abrirGaveta(sim) { if (sim && !elLentes.hidden) abrirLentes(false); gaveta.hidden = !sim; botaoBairros.setAttribute('aria-pressed', String(sim)); if (sim) { desenharTrilho(); contas(); } }
botaoBairros.addEventListener('click', () => abrirGaveta(gaveta.hidden));
// cartões redimensionáveis: arrastar o canto marcado; o tamanho fica guardado neste navegador
function redimensionavel(el, chave) {
  try { const g = JSON.parse(localStorage.getItem('cidade-' + chave) || 'null'); if (g) { el.style.width = g.w + 'px'; el.style.height = g.h + 'px'; } } catch (_) {}
  el.addEventListener('dblclick', (e) => { if (!e.target.closest('.puxador')) return; el.style.width = el.style.height = ''; try { localStorage.removeItem('cidade-' + chave); } catch (_) {} });
  el.addEventListener('pointerdown', (e) => { const p = e.target.closest('.puxador'); if (!p || p.parentElement !== el) return; e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, so = p.dataset.canto === 'so';
    const mover = (ev) => { const dx = ev.clientX - x0, dy = ev.clientY - y0; el.style.width = Math.max(200, so ? r.width - dx : r.width + dx) + 'px'; el.style.height = Math.max(140, so ? r.height + dy : r.height - dy) + 'px'; };
    const fim = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', fim); window.removeEventListener('pointercancel', fim); try { localStorage.setItem('cidade-' + chave, JSON.stringify({ w: el.offsetWidth, h: el.offsetHeight })); } catch (_) {} };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', fim); window.addEventListener('pointercancel', fim); });
}
redimensionavel(elFicha, 'ficha'); redimensionavel(gaveta, 'bairros');
function desenharTrilho() {
  const [t, id] = (escolhido || 'b:' + BAIRROS[0].id).split(':'), aberto = t === 'b' ? id : t === 'o' ? (fichaOp ? fichaOp.fluxo : BAIRROS[0].id) : t === 'm' || t === 'g' ? 'esteira' : (PREDIO[id] || {}).bairro || BAIRROS[0].id;
  trilho.innerHTML = '<h2>Bairros — clique para ver</h2>' + BAIRROS.map(b => { const r = resumoSpecs(b.id);
    const sub = b.id !== aberto ? '' : PREDIOS.filter(p => (p.bairro === b.id && (p.tipo === 'estacao' || p.tipo === 'desvio') && EST[p.id])).sort((x, y) => (x.tipo === 'desvio') - (y.tipo === 'desvio') || (x.n || 99) - (y.n || 99))
      .map(p => `<button class="tb sub ${p.tipo === 'desvio' ? 'desvio' : ''} ${escolhido === 'p:' + p.id ? 'on' : ''}" data-alvo="p:${p.id}"><b>${p.tipo === 'desvio' ? '!' : p.n || '·'}</b><span>${esc(p.nome)}</span><em data-conta="${p.id}">0</em></button>`).join('') +
      `<button class="tb sub arq" data-specs="${b.id}"><b>▤</b><span>Specs do bairro</span><em>${r.total + r.adrs}</em></button>`;
    return `<button class="tb ${escolhido === 'b:' + b.id ? 'on' : ''}" data-alvo="b:${b.id}" style="--cb:${hex(b.cor)}"><i></i><span>${esc(b.nome)}<small>${esc(b.sub)}</small></span><em title="specs">${r.total}</em></button>${sub}`; }).join('');
}
trilho.addEventListener('click', e => { const b = e.target.closest('.tb'); if (!b) return; if (b.dataset.specs) abrirSpecs(b.dataset.specs, null); else escolher(...b.dataset.alvo.split(':')); });

// ---------- rótulos ----------
const camada = $('#rotulos'), rotulos = [];
function rotulo(cls, html, x, y, z, nivel, acao, cor, vis) { const el = document.createElement(acao ? 'button' : 'div'); el.className = 'rot ' + cls; el.innerHTML = html; if (cor) el.style.setProperty('--cb', cor); if (acao) { el.tabIndex = -1; el.addEventListener('click', acao); } camada.appendChild(el); const r = { el, x, y, z, nivel, vis }; rotulos.push(r); return r; }
for (const b of BAIRROS) rotulo('bairro', `${esc(b.nome)}<small>${esc(b.sub)}</small>`, b.c[0], 1, b.c[1] + b.s[1] / 2 + 2.5, 0, () => escolher('b', b.id), hex(b.cor), 'b:' + b.id);
for (const p of PREDIOS) { const forte = p.ext || (BAIRRO[p.bairro] || {}).foco && p.tipo === 'estacao', nivel = p.tipo === 'desvio' ? 4 : forte ? 1 : 2;
  const r = rotulo('predio' + (p.tipo === 'desvio' ? ' desvio' : '') + (forte || p.tipo === 'estacao' ? '' : ' leve'), (p.n ? `<b>${p.n}</b>` : p.tipo === 'desvio' ? '<b>!</b>' : '') + `<span>${esc(p.nome)}</span>` + (EST[p.id] ? '<em>0</em>' : ''), p.p[0], 0, p.p[1], nivel, () => escolher('p', p.id), p.ext ? '#b9c6dc' : hex(vivos[p.id].cor), 'p:' + p.id);
  r.predio = p.id; r.conta = r.el.querySelector('em'); }
for (const b of BAIRROS) { const t = torres[b.id], q = resumoSpecs(b.id); const r = rotulo('predio arq', `<b>▤</b><span>Specs</span><em>${q.total + q.adrs}</em>`, t.x, t.alto + 1.2, t.z, 1, () => abrirSpecs(b.id, null), '#f2f6fb', 't:' + b.id); r.topo = true; r.torre = b.id; }
for (const g of C.PORTOES) { const r = rotulo('predio portao', `<b>${g.passou ? '✓' : '✗'}</b><span>${esc(g.nome)}</span><em>${g.passou}/${g.total}</em>`, g.p[0], 8, g.p[1], 2, () => escolher('g', g.id), hex(g.cor), 'g:' + g.id); r.topo = true; }
for (const r of Object.values(ROTAS)) { if (!r.rot) continue; let melhor = 0, a = null; for (let i = 1; i < r.pts.length; i++) { const l = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); if (l > melhor) { melhor = l; a = [(r.pts[i][0] + r.pts[i - 1][0]) / 2, (r.pts[i][1] + r.pts[i - 1][1]) / 2]; } } rotulo('via', esc(r.rot), a[0], 1.4, a[1], 3, null, null, 'r:' + Object.keys(ROTAS).find(k => ROTAS[k] === r)); }
const v3 = new THREE.Vector3(), LIMITE = [1e9, 270, 160, 125, 140], ALCANCE = [72, 62, 56, 30, 42];
const longe = (r) => andando() ? Math.hypot(r.x - C.andar.pos.x, r.z - C.andar.pos.z) > ALCANCE[r.nivel] * (C.andar.fator || 1) : cam.raio > LIMITE[r.nivel];
function desenharRotulos() {
  for (const r of rotulos) { const y = r.predio ? vivos[r.predio].h + (PREDIO[r.predio].ext ? 1.6 : 2.2) : r.y; v3.set(r.x, y, r.z).project(camera);
    const px = (v3.x + 1) / 2 * W, py = (1 - v3.y) / 2 * H, some = (C.oculto && r.vis && C.oculto.has(r.vis)) || (C.soRotulos && r.vis && !C.soRotulos.has(r.vis)) || v3.z > 1 || Math.abs(v3.x) > 1.08 || Math.abs(v3.y) > 1.08 || longe(r) || (px < 250 && py < 52);
    if (some) { if (!r.el.hidden) r.el.hidden = true; continue; } if (r.el.hidden) r.el.hidden = false;
    const emPe = r.predio || r.topo; r.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, ${emPe ? '-100%' : '-50%'}) translateY(${emPe ? -9 : 0}px)`;
    if (r.predio) r.el.classList.toggle('on', sobre === r.predio || escolhido === 'p:' + r.predio); }
}
let tContas = 0;
const noPatio = (id) => { const p = PREDIO[id]; return p && p.tipo === 'estacao' && p.bairro && BAIRRO[p.bairro].patio ? MODS.filter(m => m.etapaAtual === p.n) : null; };
const contaDe = (id) => noPatio(id) ? String(noPatio(id).length) : id === 'concluida' ? fmt(CONC.green + CONC.yellow + CONC.red) : String(EST[id].dentro);
const ESTADOS = [['neutra', 'sem forma · Ainda sem estado', SEM.neutra], ['green', '● Sem apontamento', SEM.green], ['yellow', '▲ Atenção', SEM.yellow], ['red', '✕ Com apontamento', SEM.red], ['desvio', '◆ Parado em desvio', 0xff8a5c]];
const elLentes = $('#lentes'), botaoLentes = $('#b-lentes'); let lenteBairro = BAIRROS[0].id;
function pintarLentes() { if (elLentes.hidden) return; const cont = {}; itens.forEach(n => { const k = lente === 'canal' ? n.canal : lente === 'doc' ? n.doc : estadoDe(n); if (k) cont[k] = (cont[k] || 0) + 1; });
  const ops = OPB[lenteBairro] || { tipos: [], origens: [] }, linhas = lente === 'canal' ? ops.origens.map(c => [c.id, c.nome, c.cor, c.desc, c.sentido === 'saida' ? 'transmissão' : c.sentido ? 'captura' : '']) : lente === 'doc' ? ops.tipos.map(d => [d.id, d.nome, d.cor, d.desc, '']) : ESTADOS.map(e => [e[0], e[1], e[2], '', '']);
  const tipo = lente === 'estado' ? 'estado' : lente, chave = linhas.map(l => l[0] + (cont[l[0]] || 0)).join() + lente + lenteBairro + (filtro ? filtro.id : '');
  if (elLentes._chave === chave) return; elLentes._chave = chave;
  const chips = lente === 'estado' ? '' : `<div class="chips">${Object.keys(OPB).map(b => `<button class="chipb ${b === lenteBairro ? 'on' : ''}" data-lbairro="${b}" style="--cb:${hex(BAIRRO[b].cor)}">${esc(BAIRRO[b].nome)}</button>`).join('')}</div>`;
  elLentes.querySelector('#l-lista').innerHTML = chips + linhas.map(([id, nome, cor, desc, marca]) => `<button class="tb ${filtro && filtro.tipo === tipo && filtro.id === id ? 'on' : ''}" data-filtro="${id}" style="--cb:${hex(cor)}"><i></i><span>${esc(nome)}${marca ? ` <u>${marca}</u>` : ''}${desc ? `<small>${esc(desc)}</small>` : ''}</span><em>${cont[id] || 0}</em></button>`).join('') +
    `<p>${filtro ? 'Isolado: os outros operários ficaram apagados. Clique de novo no mesmo item para soltar.' : 'Clique num item para isolar só esses operários na cidade.'}</p>`;
  elLentes.querySelectorAll('[data-lente]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lente === lente))); }
function abrirLentes(sim) { if (sim) { abrirMenuOp(false); abrirGaveta(false); } elLentes.hidden = !sim; botaoLentes.setAttribute('aria-pressed', String(sim)); elLentes._chave = null; pintarLentes(); }
botaoLentes.addEventListener('click', () => abrirLentes(elLentes.hidden));
elLentes.addEventListener('click', (e) => { const l = e.target.closest('[data-lente]'), f = e.target.closest('[data-filtro]');
  const lb = e.target.closest('[data-lbairro]');
  if (lb) { lenteBairro = lb.dataset.lbairro; filtro = null; } else if (l) { lente = l.dataset.lente; filtro = null; } else if (f) { const tipo = lente === 'estado' ? 'estado' : lente; filtro = filtro && filtro.tipo === tipo && filtro.id === f.dataset.filtro ? null : { tipo, id: f.dataset.filtro }; } else if (e.target.closest('[data-fecha]')) return abrirLentes(false); else return;
  elLentes._chave = null; pintarLentes(); });
function contas() {
  pintarLentes();
  for (const r of rotulos) if (r.conta && r.predio) { const t = contaDe(r.predio); if (r.conta.textContent !== t) r.conta.textContent = t; }
  trilho.querySelectorAll('[data-conta]').forEach(e => { const t = contaDe(e.dataset.conta); if (e.textContent !== t) e.textContent = t; });
  medir();
}

// ---------- controles ----------
let vel = 1, pausado = false;
function alternaPausa() { pausado = !pausado; const b = $('#b-pausa'); b.textContent = pausado ? 'Continuar' : 'Pausar'; b.setAttribute('aria-pressed', String(pausado)); }
$('#b-pausa').addEventListener('click', alternaPausa);
$('#b-cidade').addEventListener('click', () => { if (seguindo) pararSeguir(true); fechaFicha(); voarCidade(); });
document.querySelectorAll('[data-vel]').forEach(b => b.addEventListener('click', () => { vel = +b.dataset.vel; document.querySelectorAll('[data-vel]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
function medirTela() { W = app.clientWidth || 1; H = app.clientHeight || 1; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); matP.uniforms.escala.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)) * (andando() ? 0.5 : 1); }
new ResizeObserver(medirTela).observe(app); medirTela(); cam.raio = RAIO_CIDADE * folga();

// ---------- quadro a quadro ----------
function pintarOperarios() {
  let k = 0; const visivel = pontos.visible; for (const im of imsOp) im.visible = visivel; for (const m in MARCAS) { MARCAS[m].im.visible = visivel; MARCAS[m].n = 0; } if (!visivel) return;
  camera.getWorldDirection(vOlhar); qMarca.setFromAxisAngle(EIXO_Y, Math.atan2(-vOlhar.x, -vOlhar.z));   // as formas ficam sempre de frente para a câmera
  const membro = (im, x, y, ang) => { mParte.makeRotationX(ang).setPosition(x, y, 0); im.setMatrixAt(k, mFim.multiplyMatrices(mBase, mParte)); };
  const poe = (x, z, rumo, escala, balanco, c, dono, y) => { if (k >= MAXO) return; qRot.setFromAxisAngle(EIXO_Y, rumo); mBase.compose(vPos.set(x, y, z), qRot, vEsc.set(escala, escala, escala));
    imTronco.setMatrixAt(k, mBase); imCabeca.setMatrixAt(k, mBase); imCapacete.setMatrixAt(k, mBase); imMochila.setMatrixAt(k, mBase); const fora = dono && foraDoFiltro(dono), cc = fora ? APAGADO : (dono && corDoc[dono.doc]) || AMARELO, cm = fora ? APAGADO : (dono && corCanal[dono.canal]) || [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5];
    imCapacete.setColorAt(k, corOp.setRGB(cc[0], cc[1], cc[2])); imMochila.setColorAt(k, corOp.setRGB(cm[0], cm[1], cm[2]));
    corOp.setRGB(c[0], c[1], c[2]); imTronco.setColorAt(k, corOp); corOp.multiplyScalar(0.72); imBracoE.setColorAt(k, corOp); imBracoD.setColorAt(k, corOp);
    membro(imPernaE, -0.14, 0.86, balanco); membro(imPernaD, 0.14, 0.86, -balanco); membro(imBracoE, -0.37, 1.56, -balanco * 0.85); membro(imBracoD, 0.37, 1.56, balanco * 0.85);
    if (dono) { dono.vx = x; dono.vz = z; const m = fora ? null : MARCAS[estadoDe(dono)]; if (m) { mMarca.compose(vPos.set(x, y + 2.62 * escala, z), qMarca, vEsc.set(escala, escala, escala)); m.im.setMatrixAt(m.n++, mMarca); } } mapaOp[k] = dono; k++; };
  const destaque = (n) => n === seguindo || n === fichaOp;
  for (const v of viajantes) { const n = v.nota; posEm(v.pi, v.s, o); posEm(v.pi, Math.min(v.pi.total, v.s + 0.4), o2); const dx = o2.x - o.x, dz = o2.z - o.z; if (!v.rumo || dx * dx + dz * dz > 1e-5) v.rumo = Math.atan2(dx, dz);
    poe(o.x, o.z, v.rumo, n ? (destaque(n) ? 2.1 : foraDoFiltro(n) ? 1 : 1.5) : filtro ? 0.5 : 0.9, Math.sin(v.s * 2.2) * 0.75, n ? corDe(n) : v.cor, n || null, C.Y_RUA + 0.02); }
  const fila = {}; for (const w of esperas) { const p = PREDIO[w.id], lado = w.n.lado || 'S', [dx, dz] = C.LADOS[lado], ch = w.id + lado, i = fila[ch] = (fila[ch] || 0) + 1; if (i > 12 && !destaque(w.n)) continue;   // quem espera faz fila na calçada da porta por onde chegou, de frente para o prédio
    const j = Math.min(i, 12), ao = (((j - 1) % 6) - 2.5) * 1.3, fora = (dx ? p.f[0] : p.f[1]) / 2 + 1.4 + Math.floor((j - 1) / 6) * 1.3; poe(p.p[0] + dx * fora - dz * ao, p.p[1] + dz * fora + dx * ao, Math.atan2(-dx, -dz), destaque(w.n) ? 2.1 : foraDoFiltro(w.n) ? 1 : 1.5, 0, corDe(w.n), w.n, C.Y_CALCADA + 0.01); }
  // o caminho que o operário em destaque está fazendo agora, riscado na rua
  const vd = viajantes.find(v => v.nota && destaque(v.nota)) || null; if (vd !== rotaDe) { rotaDe = vd; if (vd) rotaViva.geometry.setFromPoints(vd.pi.P.map(q => new THREE.Vector3(q.x, 0.2, q.z))); } rotaViva.visible = !!vd;
  for (const im of imsOp) { im.count = k; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  for (const m in MARCAS) { MARCAS[m].im.count = MARCAS[m].n; MARCAS[m].im.instanceMatrix.needsUpdate = true; }
}
function pintarPontos() {
  let k = 0; const poe = (x, y, z, c, brilho, tam) => { if (k >= MAXP) return; aPos[k * 3] = x; aPos[k * 3 + 1] = y; aPos[k * 3 + 2] = z; aCor[k * 3] = c[0] * brilho; aCor[k * 3 + 1] = c[1] * brilho; aCor[k * 3 + 2] = c[2] * brilho; aTam[k] = tam; k++; };
  for (const v of viajantes) { const n = v.nota, c = n ? corDe(n) : v.cor, vez = n === seguindo ? 1.5 : 1; if (filtro && (!n || foraDoFiltro(n))) continue;
    for (let j = 0; j < v.cauda; j++) { const s = v.s - j * (n ? 0.85 : 0.7); if (s < 0) break; posEm(v.pi, s, o); const q = 1 - j / v.cauda; poe(o.x, 1.1, o.z, c, q * q * 0.8, v.tam * vez * 0.62 * (0.45 + 0.55 * q)); } }
  pintarOperarios();
  const pilha = {}; for (const w of esperas) { const p = PREDIO[w.id], i = pilha[w.id] = (pilha[w.id] || 0) + 1; poe(p.p[0] + (((i - 1) % 4) - 1.5) * 1.4, (p.ext ? 1.2 : 1.8) + Math.floor((i - 1) / 4) * 1.4, p.p[1] + p.f[1] / 2 + 0.5, corDe(w.n), 0.9, 1.6); }
  geoP.setDrawRange(0, k); geoP.attributes.position.needsUpdate = geoP.attributes.cor.needsUpdate = geoP.attributes.tam.needsUpdate = true;
}
function respirar(dt, agora) {
  for (const id in vivos) { const b = vivos[id], p = PREDIO[id], e = EST[id];
    const dentro = C.replay ? C.replay.filas[id] || 0 : e && e.dentro;   // no replay, a fila é a gravada
    if ((e || C.replay) && id !== 'concluida') b.alvoH = p.h + Math.min(dentro || 0, 16) * (p.ext ? 0.35 : 0.8);
    b.h += (b.alvoH - b.h) * Math.min(1, dt * 2.5); b.mesh.scale.y = b.h; b.tex.repeat.y = b.h / 3; b.pulso = Math.max(0, b.pulso - dt * 1.8);
    const sopro = calmo ? 0 : Math.sin(agora * 0.0011 + b.fase) * 0.16, foco = sobre === id || escolhido === 'p:' + id;
    b.lado.emissiveIntensity = 0.85 + sopro + b.pulso * 0.9 + (foco ? 0.5 : 0); b.teto.emissiveIntensity = (0.5 + sopro + b.pulso * 1.2 + (foco ? 0.6 : 0)) * (p.ext ? 0.3 : 1); b.linha.material.opacity = foco ? 1 : 0.5 + b.pulso * 0.4; }
  for (const a of aneis) { if (a.t >= 1) continue; a.t += dt * 0.9; const q = Math.min(1, a.t), r = 2 + a.raio * (1 - Math.pow(1 - q, 3)); a.m.scale.set(r, r, 1); a.m.material.opacity = (1 - q) * 0.75; if (q >= 1) a.m.visible = false; }
}
let ultimo = performance.now();
function quadro(agora) {
  const dt = Math.min(0.25, (agora - ultimo) / 1000); ultimo = agora;
  if (!pausado) { for (let r = dt * vel; r > 1e-4; r -= 0.05) passo(Math.min(0.05, r)); respirar(dt * vel, agora); }
  if (andando()) { centrar(dt); C.andar.quadro(dt, agora); } else {
  if (voo) { voo.t = Math.min(1, voo.t + dt / 1.25); const q = voo.t < 0.5 ? 4 * voo.t ** 3 : 1 - Math.pow(-2 * voo.t + 2, 3) / 2, a = voo.de, b = voo.para; cam.alvo.x = a.x + (b.x - a.x) * q; cam.alvo.z = a.z + (b.z - a.z) * q; cam.raio = a.raio + (b.raio - a.raio) * q; cam.phi = a.phi + (b.phi - a.phi) * q; if (voo.t >= 1) voo = null; }
  if (seguindo) { const f = 1 - Math.exp(-dt * 3.2), n = seguindo; cam.alvo.x += (n.x - cam.alvo.x) * f; cam.alvo.z += (n.z - cam.alvo.z) * f; cam.raio += (84 * folga() - cam.raio) * (1 - Math.exp(-dt * 1.6)); cam.phi += (0.74 - cam.phi) * (1 - Math.exp(-dt * 1.2));
    const alto = n.dentro ? vivos[n.dentro].h + 3.4 : 1.5; marca.position.set(n.x, marca.position.y + (alto - marca.position.y) * f, n.z); marca.rotation.z += dt * 1.6; if (fimSeguir && agora > fimSeguir) pararSeguir(false); }
  else if (!calmo && !voo && !pausado && !(window.LeitorSpecs && window.LeitorSpecs.aberto()) && agora - ocioso > 7000) cam.theta += dt * 0.014;
  centrar(dt); aplicarCam(); }
  if (!seguindo) { const n = fichaOp && escolhido === 'o:' + fichaOp.id && itens.has(fichaOp) ? fichaOp : null; marca.visible = !!n; if (n) { marca.position.set(n.vx ?? n.x, 5, n.vz ?? n.z); marca.rotation.z += dt * 1.6; } }
  if (C.tempo) C.tempo.quadro(dt);
  if (C.gerente) C.gerente.quadro(dt, agora);
  if (C.grid) C.grid.quadro(dt, agora);
  if (C.bugs) C.bugs.quadro(dt, agora);
  // o apartamento e a pista têm cena própria: quando um deles está ligado, a cidade não é desenhada
  if (C.central3d && C.central3d.ativo()) { C.central3d.quadro(dt, agora); }
  else if (C.apto && C.apto.ativo()) { C.apto.quadro(dt, agora); }
  else if (C.pista && C.pista.ativo()) { C.pista.quadro(Math.min(dt, 0.05)); }
  else { pintarPontos(); renderer.render(scene, camera); desenharRotulos(); }
  tContas -= dt; if (tContas <= 0) { tContas = 0.4; contas(); }
  requestAnimationFrame(quadro);
}
if (!window.SYSTEMCITY_AOVIVO) for (let i = 0; i < 500; i++) passo(0.1);   // ao vivo a cidade começa vazia e só enche com eventos reais
for (const a of aneis) { a.t = 1; a.m.visible = false; }
const oQue = (h) => { const u = h && h.object.userData; if (!u) return null; const d = { dist: h.distance };
  if (u.operarios) { const n = mapaOp[h.instanceId]; return n ? { ...d, t: 'o', id: n.id, n, nome: `${n.nome} nº ${n.id} — ver quem é e por que ${n.dentro ? 'parou' : 'está a caminho'}` } : null; }
  if (u.modulo) return { ...d, t: 'm', id: u.modulo, nome: u.modulo + ' — checklist na esteira' }; if (u.portao) return { ...d, t: 'g', id: u.portao, nome: C.PORTAO[u.portao].titulo };
  if (u.torre) { const s = h.instanceId != null ? torres[u.torre].itens[h.instanceId] : null; return { ...d, t: 't', id: u.torre, spec: s && s.id, nome: s ? 'Ler: ' + s.titulo : 'Specs de ' + BAIRRO[u.torre].nome }; }
  if (u.predio) return { ...d, t: 'p', id: u.predio, nome: PREDIO[u.predio].nome + ' — abrir a ficha' }; if (u.bairro) return { ...d, t: 'b', id: u.bairro, nome: 'Bairro ' + BAIRRO[u.bairro].nome }; return null; };
const mirar = () => { const r = canvas.getBoundingClientRect(); return oQue(acertar({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
const abrirAlvo = (a) => { if (!a) return; if (a.t === 'o') verOperario(a.n); else if (a.t === 't') abrirSpecs(a.id, a.spec || null); else mostrarFicha(a.t, a.id); };
C.api = { soltar: (bairro, tipo) => { const g = NASCE.find(x => x.bairro === bairro); return g ? novoOperario(g, tipo && DOC[tipo] ? tipo : undefined) : null; }, bairroAberto: () => { const [t0, i0] = (escolhido || 'b:' + BAIRROS[0].id).split(':'); return t0 === 'b' ? i0 : (PREDIO[i0] || {}).bairro || BAIRROS[0].id; }, verOperario, seguirItem, parados: () => esperas.map(w => w.n), abrirGaveta, pontos, aneis, rotulos, voarCidade, acharSpec, mirar, abrirAlvo, escolher, mostrarFicha, abrirSpecs, fechaFicha, clicar, medirTela, cam, resumoSpecs, largura: () => W, soltarSeguir: () => { if (seguindo) pararSeguir(true); voo = null; }, olharPara: (x, z, r) => { voo = null; cam.alvo.x = x; cam.alvo.z = z; cam.raio = r; cam.phi = 0.8; ocioso = performance.now(); } };
desenharTrilho(); if (window.matchMedia('(min-width: 861px)').matches) abreFicha();
aplicarCam(); requestAnimationFrame(quadro);
})();
