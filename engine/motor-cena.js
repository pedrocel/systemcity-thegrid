// SystemCity — parte 1: constrói o mundo a partir de mapa.js e do catálogo de specs. Expõe tudo em window.CID.
// Modelo urbano: a cidade é uma malha de QUARTEIRÕES; a RUA é o vão entre eles. Cada prédio fica num quarteirão, com a porta na face sul,
// e todo caminho é de porta a porta, pela malha. Não existe rua exclusiva de um fluxo: quem mostra o fluxo é o operário.
(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const app = $('#app'), canvas = $('#cena'), M = window.CIDADE_MAPA, CAT = window.CIDADE_SPECS || { bairros: {}, repos: [] };
if (!window.THREE || !M) { $('#semgl').hidden = false; return; }
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { $('#semgl').hidden = false; return; }

let _s = 20260919;
const rnd = () => { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const entre = (a, b) => a + (b - a) * rnd();
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const rgb = (n) => [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];

// ---------- a malha ----------
const P = 15, RUA = 4, QUADRA = P - RUA, LARG = RUA, FAIXA = 1, Y_RUA = 0.06, Y_CALCADA = 0.3;   // passo da malha, largura da rua, lado do quarteirão
const centro = ([i, j]) => [i * P, j * P], chaveQ = (i, j) => i + ',' + j, ocup = {};            // ocup: o que há em cada quarteirão

// ---------- dados: prédios em quarteirões ----------
const BAIRROS = M.bairros, BAIRRO = Object.fromEntries(BAIRROS.map(b => [b.id, b]));
const PREDIOS = [...M.predios.map(p => ({ ...p, p: centro(p.q) })), ...M.externos.map(e => ({ ...e, p: centro(e.q), ext: true, tipo: 'externo' }))];
const ROTAS = {}; for (const [id, r] of Object.entries(M.rotas)) ROTAS[id] = { ...r };
const FLUXO = { ...(M.fluxo || {}) };   // fluxos escritos à mão na cidade; os bairros com `estacoes` ganham o deles logo abaixo
const PORTOES = [], ESTEIRA = window.CIDADE_ESTEIRA || { modulos: [] };
const NASCE = [...(M.nascentes || [])];

for (const b of BAIRROS) {
  const [i0, j0, cols, lins] = b.grade; b.c = [(i0 + (cols - 1) / 2) * P, (j0 + (lins - 1) / 2) * P]; b.s = [cols * P, lins * P]; b.x0 = b.c[0] - b.s[0] / 2; b.z0 = b.c[1] - b.s[1] / 2;
  for (let i = i0; i < i0 + cols; i++) for (let j = j0; j < j0 + lins; j++) ocup[chaveQ(i, j)] = { bairro: b.id };
  b.torre = b.torre || [i0 + cols - 1, j0]; b.arquivo = centro(b.torre); ocup[chaveQ(...b.torre)].uso = 'torre';
  for (const e of b.extras || []) PREDIOS.push({ ...e, p: centro(e.q), bairro: b.id, tipo: e.tipo || 'servico' });
  if (!b.estacoes) continue;
  // estações em serpentina pelos quarteirões; o desvio fica no quarteirão logo ao sul da estação dele, por isso as linhas de estação pulam uma
  const n = b.porLinha, salto = (b.desvios || []).length || b.patio ? 2 : 1, pos = {}, qd = {};
  b.estacoes.forEach((e, k) => { const lin = Math.floor(k / n); let col = k % n; if (lin % 2) col = n - 1 - col; if (b.inverso) col = n - 1 - col;
    qd[e.id] = [i0 + col, j0 + lin * salto]; pos[e.id] = centro(qd[e.id]); PREDIOS.push({ ...e, bairro: b.id, tipo: 'estacao', n: k + 1, q: qd[e.id], p: pos[e.id], f: [8, 7], h: 6, auto: true }); });
  b.estacoes.forEach((e, k) => { const prox = b.estacoes[k + 1]; if (prox) ROTAS[`${b.id}:${k}`] = { de: e.id, para: prox.id, cor: b.cor };
    FLUXO[e.id] = { espera: e.espera || [1.6, 4.2], prox: prox ? { rota: `${b.id}:${k}`, para: prox.id } : null, fim: !prox, chama: e.chama }; });
  for (const d of b.desvios || []) { const q = [qd[d.de][0], qd[d.de][1] + 1];
    PREDIOS.push({ ...d, bairro: b.id, tipo: 'desvio', q, p: centro(q), f: [6, 5], h: 3, auto: true, entra: PREDIOS.find(x => x.id === d.de).nome, sai: PREDIOS.find(x => x.id === d.volta).nome + ' (de novo)' });
    ROTAS[`${d.id}:ida`] = { de: d.de, para: d.id, cor: 0xff5d6c }; FLUXO[d.de].desvio = { id: d.id, p: d.p, rota: `${d.id}:ida` };
    if (d.volta === d.de) FLUXO[d.id] = { espera: [4, 8], volta: { rota: `${d.id}:ida`, inverso: true, para: d.volta } };
    else { ROTAS[`${d.id}:volta`] = { de: d.id, para: d.volta, cor: 0xff5d6c }; FLUXO[d.id] = { espera: [4, 8], volta: { rota: `${d.id}:volta`, inverso: false, para: d.volta } }; } }
  if (!b.semItens) NASCE.push({ bairro: b.id, nome: b.operario || b.nome, cada: b.cada || 3, em: b.estacoes[0].id, t: rnd() * 3, passos: b.estacoes.map(e => e.id) });
  for (const g of b.portoes || []) { const a = pos[g.apos]; PORTOES.push({ ...g, bairro: b.id, p: [a[0] + P / 2, a[1] + P / 2] }); }   // pórtico sobre a rua, entre um quarteirão e o seguinte
  if (b.patio) b.estacoes.forEach(e => { const q = [qd[e.id][0], qd[e.id][1] + 2]; ocup[chaveQ(...q)].uso = 'patio'; e.patio = centro(q); });
  b.pos = pos;
}
for (const p of PREDIOS) { const o = ocup[chaveQ(...p.q)] || (ocup[chaveQ(...p.q)] = {}); o.uso = 'predio'; o.predio = p.id; if (p.ext) o.ext = p.id; }
const PREDIO = Object.fromEntries(PREDIOS.map(p => [p.id, p]));
for (const p of PREDIOS) { const f = FLUXO[p.id]; if (p.auto && p.tipo === 'estacao' && f) { p.entra = p.entra || (p.n > 1 ? BAIRRO[p.bairro].estacoes[p.n - 2].nome : 'início do fluxo'); p.sai = p.sai || (f.prox ? PREDIO[f.prox.para].nome : 'fim do fluxo'); if (f.desvio) p.desvio = PREDIO[f.desvio.id].nome; } }

// ---------- caminho de porta a porta pela malha ----------
// Todo prédio tem porta nas quatro faces (S, N, L, O), cada uma dando para a rua daquele lado do quarteirão.
// Entre as 16 combinações de porta de saída e de chegada, vale a de caminho mais curto; no empate, a fachada sul.
const LADOS = { S: [0, 1], N: [0, -1], L: [1, 0], O: [-1, 0] };
const portaEm = (p, l) => [p.p[0] + LADOS[l][0] * (p.f[0] / 2 + 0.5), p.p[1] + LADOS[l][1] * (p.f[1] / 2 + 0.5)], ruaEm = (p, l) => [p.p[0] + LADOS[l][0] * P / 2, p.p[1] + LADOS[l][1] * P / 2];
const porta = (id) => portaEm(PREDIO[id], 'S'), ruaDe = (id) => ruaEm(PREDIO[id], 'S');
function ligar(A, la, B, lb) {
  const [xa, za] = ruaEm(A, la), [xb, zb] = ruaEm(B, lb), ha = la === 'S' || la === 'N', hb = lb === 'S' || lb === 'N'; let meio;
  const menor = (cands, custo) => cands.reduce((m, c) => (custo(c) < custo(m) ? c : m));
  if (ha && hb) meio = za === zb ? [[xa, za], [xb, zb]] : (() => { const v = menor([xa - P / 2, xa + P / 2, xb - P / 2, xb + P / 2], c => Math.abs(xa - c) + Math.abs(c - xb)); return [[xa, za], [v, za], [v, zb], [xb, zb]]; })();
  else if (!ha && !hb) meio = xa === xb ? [[xa, za], [xb, zb]] : (() => { const h = menor([za - P / 2, za + P / 2, zb - P / 2, zb + P / 2], c => Math.abs(za - c) + Math.abs(c - zb)); return [[xa, za], [xa, h], [xb, h], [xb, zb]]; })();
  else meio = ha ? [[xa, za], [xb, za], [xb, zb]] : [[xa, za], [xa, zb], [xb, zb]];   // uma rua é leste–oeste e a outra norte–sul: dobram na esquina onde se cruzam
  return [portaEm(A, la), ...meio, portaEm(B, lb)].filter((pt, k, l) => !k || Math.hypot(pt[0] - l[k - 1][0], pt[1] - l[k - 1][1]) > 0.01);
}
const comprimento = (pts) => pts.reduce((a, pt, k) => (k ? a + Math.hypot(pt[0] - pts[k - 1][0], pt[1] - pts[k - 1][1]) : 0), 0);
function caminho(de, para) { const A = PREDIO[de], B = PREDIO[para]; let melhor = null;
  for (const la of 'SNLO') for (const lb of 'SNLO') { const pts = ligar(A, la, B, lb), d = comprimento(pts); if (!melhor || d < melhor.d - 0.01) melhor = { pts, d, ladoDe: la, ladoPara: lb }; } return melhor; }
const portasUsadas = {};   // por prédio, os lados que alguma rota usa: só esses ganham soleira
const usados = new Set();   // trechos de rua por onde passa alguma rota: h:i:j = rua ao sul da linha j, no quarteirão i · v:i:j = rua a leste da coluna i, no quarteirão j
for (const r of Object.values(ROTAS)) { const c = caminho(r.de, r.para); r.pts = c.pts; r.ladoDe = c.ladoDe; r.ladoPara = c.ladoPara; r.objs = []; (portasUsadas[r.de] ??= new Set(['S'])).add(c.ladoDe); (portasUsadas[r.para] ??= new Set(['S'])).add(c.ladoPara);
  for (let k = 2; k < r.pts.length - 1; k++) { const [ax, az] = r.pts[k - 1], [bx, bz] = r.pts[k];
    if (Math.abs(az - bz) < 0.01) { const j = Math.round((az - P / 2) / P); for (let i = Math.floor(Math.min(ax, bx) / P); i <= Math.ceil(Math.max(ax, bx) / P); i++) if (Math.min((i + 0.5) * P, Math.max(ax, bx)) - Math.max((i - 0.5) * P, Math.min(ax, bx)) > 0.2) usados.add(`h:${i}:${j}`); }
    else { const i = Math.round((ax - P / 2) / P); for (let j = Math.floor(Math.min(az, bz) / P); j <= Math.ceil(Math.max(az, bz) / P); j++) if (Math.min((j + 0.5) * P, Math.max(az, bz)) - Math.max((j - 0.5) * P, Math.min(az, bz)) > 0.2) usados.add(`v:${i}:${j}`); } } }

// ---------- cena ----------
const scene = new THREE.Scene(); renderer.setClearColor(0x000000, 0);
scene.fog = new THREE.FogExp2(0x060b14, 0.0019);
const camera = new THREE.PerspectiveCamera(42, 1, 1, 1800);
scene.add(new THREE.AmbientLight(0x8fb0e0, 1.0));
const sol = new THREE.DirectionalLight(0xaecbff, 0.55); sol.position.set(-70, 140, 60); scene.add(sol);
scene.add(new THREE.HemisphereLight(0x27406b, 0x05080f, 0.5));
const chao = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x070d19, roughness: 1 })); chao.rotation.x = -Math.PI / 2; chao.position.y = -0.02; scene.add(chao);

function texJanelas(cor, acesas) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) { if (rnd() > acesas) continue; g.globalAlpha = 0.35 + rnd() * 0.65; g.fillStyle = cor; g.fillRect(4 + k * 15, 5 + l * 15, 9, 7); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
}
const caixa = new THREE.BoxGeometry(1, 1, 1); caixa.translate(0, 0.5, 0);
const arestas = new THREE.EdgesGeometry(caixa), alvos = [], vivos = {}, solidos = [], tmp = new THREE.Object3D(), corTmp = new THREE.Color();
const instanciar = (geo, mat, lista, pai) => { if (!lista.length) return null; const im = new THREE.InstancedMesh(geo, mat, lista.length);
  lista.forEach(([x, y, z, ang], k) => { tmp.position.set(x, y, z); tmp.rotation.set(0, ang || 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); im.setMatrixAt(k, tmp.matrix); });
  im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; (pai || scene).add(im); return im; };

// ---------- chão de cada bairro e calçadas: o quarteirão é uma laje mais alta que a rua ----------
const geoLaje = new THREE.BoxGeometry(QUADRA, Y_CALCADA, QUADRA), geoMeioFio = new THREE.EdgesGeometry(geoLaje);
for (const b of BAIRROS) { const [i0, j0, cols, lins] = b.grade, grupo = new THREE.Group(); grupo.position.set(b.c[0], 0, b.c[1]); scene.add(grupo);
  const placa = new THREE.Mesh(new THREE.BoxGeometry(b.s[0], 0.04, b.s[1]), new THREE.MeshStandardMaterial({ color: b.foco ? 0x0c1a30 : 0x0a1526, roughness: 0.95 })); placa.position.y = 0.02; placa.userData.bairro = b.id; grupo.add(placa); alvos.push(placa);
  const borda = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.s[0], 0.5, b.s[1])), new THREE.LineBasicMaterial({ color: b.cor, transparent: true, opacity: b.foco ? 0.95 : 0.6 })); borda.position.y = 0.25; grupo.add(borda);
  const lajes = []; for (let i = i0; i < i0 + cols; i++) for (let j = j0; j < j0 + lins; j++) lajes.push([i * P - b.c[0], Y_CALCADA / 2, j * P - b.c[1]]);
  const tinta = new THREE.Color(b.cor).multiplyScalar(0.16).add(new THREE.Color(0x0d1828)); instanciar(geoLaje, new THREE.MeshStandardMaterial({ color: tinta, roughness: 0.85, metalness: 0.1 }), lajes, grupo);
  const matFio = new THREE.LineBasicMaterial({ color: b.cor, transparent: true, opacity: 0.22 }); for (const [x, y, z] of lajes) { const l = new THREE.LineSegments(geoMeioFio, matFio); l.position.set(x, y, z); grupo.add(l); }
  b.objs = [grupo]; }
instanciar(geoLaje, new THREE.MeshStandardMaterial({ color: 0x0f1726, roughness: 0.9 }), PREDIOS.filter(p => p.ext).map(p => [p.p[0], Y_CALCADA / 2, p.p[1]]));

// ---------- ruas: o vão entre os quarteirões. Só existe trecho onde há quarteirão ocupado de um lado, ou onde alguma rota passa ----------
const matRua = new THREE.MeshStandardMaterial({ color: 0x182231, roughness: 0.95, metalness: 0.05 }), matTraco = new THREE.MeshBasicMaterial({ color: 0xf2d46a, transparent: true, opacity: 0.8 });
const geoTrechoH = new THREE.BoxGeometry(P, 0.04, RUA), geoTrechoV = new THREE.BoxGeometry(RUA, 0.04, P), geoTraco = new THREE.BoxGeometry(1.1, 0.02, 0.16);
const formaSeta = new THREE.Shape(); formaSeta.moveTo(0.95, 0); formaSeta.lineTo(0.2, 0.44); formaSeta.lineTo(0.2, 0.14); formaSeta.lineTo(-0.85, 0.14); formaSeta.lineTo(-0.85, -0.14); formaSeta.lineTo(0.2, -0.14); formaSeta.lineTo(0.2, -0.44); formaSeta.closePath();
const geoSeta = new THREE.ShapeGeometry(formaSeta); geoSeta.rotateX(-Math.PI / 2); const matSeta = new THREE.MeshBasicMaterial({ color: 0xe8eef8, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
const is = Object.keys(ocup).map(k => +k.split(',')[0]), js = Object.keys(ocup).map(k => +k.split(',')[1]), iMin = Math.min(...is) - 1, iMax = Math.max(...is) + 1, jMin = Math.min(...js) - 1, jMax = Math.max(...js) + 1;
const grupos = {}, donoDe = (o) => (o ? (o.ext ? 'x:' + o.ext : o.bairro) : null);
const trecho = (tipo, i, j, a, b) => { const donos = [...new Set([donoDe(ocup[a]), donoDe(ocup[b])].filter(Boolean))], usado = usados.has(`${tipo}:${i}:${j}`); if (!donos.length && !usado) return;
  const chave = donos.join('|') || 'av', g = grupos[chave] || (grupos[chave] = { donos, H: [], V: [], tracos: [], setas: [] }), h = tipo === 'h', cx = h ? i * P : i * P + P / 2, cz = h ? j * P + P / 2 : j * P, ang = h ? 0 : Math.PI / 2;
  (h ? g.H : g.V).push([cx, Y_RUA + (h ? 0 : 0.002), cz]); for (const t of [-3.7, 0, 3.7]) g.tracos.push([cx + (h ? t : 0), Y_RUA + 0.03, cz + (h ? 0 : t), ang]);
  // seta de mão: quem vai para leste anda na faixa sul; quem vai para o sul anda na faixa oeste (mão direita)
  if (usado) { if (h) { g.setas.push([cx - 2.2, Y_RUA + 0.04, cz + FAIXA, 0]); g.setas.push([cx + 2.2, Y_RUA + 0.04, cz - FAIXA, Math.PI]); } else { g.setas.push([cx - FAIXA, Y_RUA + 0.04, cz - 2.2, -Math.PI / 2]); g.setas.push([cx + FAIXA, Y_RUA + 0.04, cz + 2.2, Math.PI / 2]); } } };
for (let i = iMin; i <= iMax; i++) for (let j = jMin; j <= jMax; j++) { trecho('h', i, j, chaveQ(i, j), chaveQ(i, j + 1)); trecho('v', i, j, chaveQ(i, j), chaveQ(i + 1, j)); }
const RUAS = Object.values(grupos).map(g => ({ donos: g.donos, objs: [instanciar(geoTrechoH, matRua, g.H), instanciar(geoTrechoV, matRua, g.V), instanciar(geoTraco, matTraco, g.tracos), instanciar(geoSeta, matSeta, g.setas)].filter(Boolean) }));

// ---------- prédios com nome ----------
for (const p of PREDIOS) {
  const cor = p.ext ? 0xb9c6dc : p.tipo === 'desvio' ? 0xff5d6c : BAIRRO[p.bairro].cor;
  const tex = texJanelas(hex(cor), p.tipo === 'desvio' ? 0.35 : 0.72); tex.repeat.set(Math.max(1, Math.round(Math.max(p.f[0], p.f[1]) / 3.2)), p.h / 3);
  const lado = new THREE.MeshStandardMaterial({ color: p.ext ? 0x1d2638 : 0x17294a, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1, roughness: 0.6, metalness: 0.3 });
  const teto = new THREE.MeshStandardMaterial({ color: 0x0a1424, emissive: cor, emissiveIntensity: 0.55, roughness: 0.8 });
  const mesh = new THREE.Mesh(caixa, [lado, lado, teto, lado, lado, lado]); mesh.position.set(p.p[0], Y_CALCADA, p.p[1]); mesh.scale.set(p.f[0], p.h, p.f[1]); mesh.userData.predio = p.id; scene.add(mesh); alvos.push(mesh);
  const linha = new THREE.LineSegments(arestas, new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.55 })); mesh.add(linha);
  const soleira = new THREE.Group(), matSol = new THREE.MeshBasicMaterial({ color: cor }); scene.add(soleira);   // as portas: uma soleira acesa em cada face por onde passa alguma rota
  for (const l of portasUsadas[p.id] || ['S']) { const [sx, sz] = portaEm(p, l), ns = l === 'S' || l === 'N', m = new THREE.Mesh(new THREE.BoxGeometry(ns ? 2.2 : 1, 0.06, ns ? 1 : 2.2), matSol); m.position.set(sx, Y_CALCADA + 0.03, sz); soleira.add(m); }
  vivos[p.id] = { mesh, lado, teto, tex, linha, h: p.h, alvoH: p.h, fase: rnd() * 6.28, cor, pulso: 0, pedestal: soleira };
  solidos.push({ x: p.p[0], z: p.p[1], w: p.f[0], d: p.f[1], h: p.h, predio: p.id });
}

// ---------- gates: pórtico sobre a rua, verde se algum módulo real já passou, vermelho se nenhum ----------
const PORTAO = {};
for (const g of PORTOES) { const passou = ESTEIRA.modulos.filter(m => m.etapas[g.etapa - 1] && m.etapas[g.etapa - 1].gatePassou).length; g.passou = passou; g.total = ESTEIRA.modulos.length; g.cor = passou ? 0x5fd38d : 0xff5d6c; PORTAO[g.id] = g;
  const mat = new THREE.MeshBasicMaterial({ color: g.cor }), escuro = new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.6, metalness: 0.4 });
  for (const [w, h, d, x, y, z, m] of [[0.7, 5.6, 0.7, 0, 3.0, -2.6, escuro], [0.7, 5.6, 0.7, 0, 3.0, 2.6, escuro], [0.9, 0.9, 6.4, 0, 6.1, 0, mat], [0.22, 5.2, 0.22, 0.36, 2.9, -2.6, mat], [0.22, 5.2, 0.22, 0.36, 2.9, 2.6, mat]]) {
    const peca = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); peca.position.set(g.p[0] + x, y, g.p[1] + z); peca.userData.portao = g.id; scene.add(peca); alvos.push(peca); (g.objs ??= []).push(peca); }
  for (const dz of [-2.6, 2.6]) solidos.push({ x: g.p[0], z: g.p[1] + dz, w: 0.7, d: 0.7, h: 6 }); }

// ---------- pátio: um contêiner por módulo real, no quarteirão de pátio da etapa em que o scanner o encontrou ----------
const CAIXA = {};
for (const b of BAIRROS) { if (!b.patio) continue;
  b.estacoes.forEach((e, i) => { const aqui = ESTEIRA.modulos.filter(m => m.etapaAtual === i + 1), [ex, ez] = e.patio;
    aqui.forEach((m, k) => { const x = ex + ((k % 4) - 1.5) * 2.5, z = ez - 3.7 + Math.floor(k / 4) * 2.5, cor = (BAIRRO[m.bairro] || b).cor;
      const cx = new THREE.Mesh(caixa, new THREE.MeshStandardMaterial({ color: m.preEsteira ? 0x3a4558 : cor, emissive: cor, emissiveIntensity: m.preEsteira ? 0.06 : 0.32, roughness: 0.5, metalness: 0.2 })); cx.position.set(x, Y_CALCADA, z); cx.scale.set(2, 1.5, 2); cx.userData.modulo = m.slug; scene.add(cx); alvos.push(cx);
      cx.add(new THREE.LineSegments(arestas, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }))); CAIXA[m.slug] = { ...m, p: [x, z], mesh: cx, lams: [], yBase: Y_CALCADA };
      (m.fatias || []).slice(0, 16).forEach((f, q) => { const lam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 1.7), new THREE.MeshBasicMaterial({ color: f.entregue ? 0x5fd38d : 0x5d7390 })); lam.position.set(x, Y_CALCADA + 1.62 + q * 0.21, z); lam.userData.modulo = m.slug; scene.add(lam); alvos.push(lam); CAIXA[m.slug].lams.push(lam); });
      solidos.push({ x, z, w: 2, d: 2, h: 1.5, modulo: m.slug }); }); }); }

// ---------- torres de specs: uma lâmina por spec, na cor do estado dela, num quarteirão só dela ----------
const COR_CLASSE = { ok: 0x5fd38d, andamento: 0xf4c542, sem: 0x6b7f99, antigo: 0x6b7f99 }, COR_ADR = 0xa78bfa, POR_COLUNA = 20;
const lamina = new THREE.BoxGeometry(4.2, 0.26, 2.7), torres = {};
for (const b of BAIRROS) {
  const itens = [...(CAT.bairros[b.id] || [])].sort((x, y) => (x.natureza === 'adr') - (y.natureza === 'adr')), colunas = Math.max(1, Math.ceil(itens.length / POR_COLUNA)), larg = Math.min(2, colunas), fundo = Math.ceil(colunas / 2), ax = b.arquivo[0], az = b.arquivo[1] - (fundo - 1) * 1.6;
  const base = new THREE.Mesh(new THREE.BoxGeometry(larg * 4.8 + 1, 0.5, fundo * 3.2 + 1), new THREE.MeshStandardMaterial({ color: 0x0a1424, emissive: 0xffffff, emissiveIntensity: 0.08 })); base.position.set(ax, Y_CALCADA + 0.25, b.arquivo[1]); scene.add(base);
  solidos.push({ x: ax, z: b.arquivo[1], w: larg * 4.8 + 1, d: fundo * 3.2 + 1, h: 11, torre: b.id });
  const t = { bairro: b.id, itens, x: ax, z: az, alto: 2, larg, base, giro: itens.map(() => (rnd() - 0.5) * 0.22), porColuna: POR_COLUNA, passoZ: 3.2, passoX: 2.4, y0: Y_CALCADA + 0.9 }; torres[b.id] = t; if (!itens.length) continue;
  const im = new THREE.InstancedMesh(lamina, new THREE.MeshBasicMaterial({ color: 0xffffff }), itens.length);
  itens.forEach((s, i) => { const col = Math.floor(i / POR_COLUNA), niv = i % POR_COLUNA; tmp.scale.set(1, 1, 1);
    tmp.position.set(ax + (larg === 2 ? (col % 2 ? t.passoX : -t.passoX) : 0), t.y0 + niv * 0.44, az + Math.floor(col / 2) * t.passoZ); tmp.rotation.set(0, t.giro[i], 0); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
    im.setColorAt(i, corTmp.setHex(s.natureza === 'adr' ? COR_ADR : COR_CLASSE[s.classe])); });
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.userData.torre = b.id; im.frustumCulled = false; scene.add(im); alvos.push(im);
  t.im = im; t.alto = t.y0 + Math.min(itens.length, POR_COLUNA) * 0.44;
}

// ---------- prédios de enchimento: os quarteirões livres do bairro viram lotes, alinhados à rua ----------
const classes = [4, 7, 11];
for (const b of BAIRROS) { const [i0, j0, cols, lins] = b.grade; b.enchimento = [];
  const mats = classes.map(h => { const t = texJanelas(hex(b.cor), b.foco ? 0.62 : 0.42); t.repeat.set(1, h / 3.4); return new THREE.MeshStandardMaterial({ color: 0x16273f, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: b.foco ? 1.1 : 0.6, roughness: 0.7, metalness: 0.2 }); });
  const matTeto = new THREE.MeshStandardMaterial({ color: 0x0a1322, roughness: 0.9 }), matAresta = new THREE.LineBasicMaterial({ color: b.cor, transparent: true, opacity: b.foco ? 0.34 : 0.18 });
  for (let i = i0; i < i0 + cols; i++) for (let j = j0; j < j0 + lins; j++) { if (ocup[chaveQ(i, j)].uso) continue;
    for (const [ox, oz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) { if (rnd() < 0.2) continue;   // quatro lotes por quarteirão; um ou outro fica vago
      const w = entre(3.4, 4.4), d = entre(3.4, 4.4), x = i * P + ox, z = j * P + oz, k = rnd() < 0.55 ? 0 : rnd() < 0.7 ? 1 : 2, hh = classes[k] * entre(0.8, 1.1);
      const m = new THREE.Mesh(caixa, [mats[k], mats[k], matTeto, matTeto, mats[k], mats[k]]); m.position.set(x, Y_CALCADA, z); m.scale.set(w, hh, d); m.add(new THREE.LineSegments(arestas, matAresta)); scene.add(m); m.userData.hh = hh; b.enchimento.push(m); solidos.push({ x, z, w, d, h: hh }); } } }

// ---------- limites e utilidades para quem anda, dirige e filma ----------
const LIMITES = { x0: (iMin - 0.5) * P, x1: (iMax + 0.5) * P, z0: (jMin - 0.5) * P, z1: (jMax + 0.5) * P };
scene.fog.density = Math.min(0.0019, 1.4 / Math.max(LIMITES.x1 - LIMITES.x0, LIMITES.z1 - LIMITES.z0));   // mapa grande (universo) pede neblina mais rala
const naQuadra = (x, z) => { const i = Math.round(x / P), j = Math.round(z / P); return !!ocup[chaveQ(i, j)] && Math.abs(x - i * P) <= QUADRA / 2 && Math.abs(z - j * P) <= QUADRA / 2; };
const alturaChao = (x, z) => (naQuadra(x, z) ? Y_CALCADA : Y_RUA);

window.CID = { $, app, canvas, renderer, scene, camera, M, CAT, BAIRROS, BAIRRO, P, LARG, FAIXA, Y_RUA, Y_CALCADA, PREDIOS, PREDIO, ROTAS, RUAS, FLUXO, NASCE, alvos, vivos, torres, solidos, PORTOES, PORTAO, CAIXA, ESTEIRA, LIMITES, LADOS, porta, ruaDe, portaEm, caminho, alturaChao, rnd, entre, hex, rgb, COR_CLASSE, COR_ADR };
})();
