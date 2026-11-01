// SystemCity — sinalização. Toda placa informa algo verdadeiro da cidade:
//   entrada de bairro  → nome, o que é e quantas specs tem (e quantas aprovadas)
//   placa de estação   → nome, número na esteira e o bairro
//   placa de saídas    → para onde os operários daquele prédio seguem e a que distância pela malha (a rua é de todos, a saída é do prédio)
//   losango de desvio  → aviso de desvio, com o nome dele e para onde volta
// As placas entram nas mesmas listas que a linha do tempo usa (b.objs, r.objs, vivos[id].extras): nascem com o que sinalizam.
(() => {
'use strict';
const C = window.CID; if (!C) return;
const { scene, BAIRROS, BAIRRO, PREDIOS, PREDIO, ROTAS, FLUXO, vivos, CAT } = C, hex = (n) => '#' + n.toString(16).padStart(6, '0');
const matPoste = new THREE.MeshStandardMaterial({ color: 0x2a3547, roughness: 0.6, metalness: 0.5 }), matVerso = new THREE.MeshBasicMaterial({ color: 0x0c1422 });
const FONTE = '"Red Hat Display", "Avenir Next", "Segoe UI", sans-serif';

// desenha o rosto da placa num canvas: linhas = [{ t: texto, p: peso, s: tamanho, c: cor }]
function rosto(linhas, fundo, borda, w, h, forma) {
  const c = document.createElement('canvas'), k = 64; c.width = Math.round(w * k); c.height = Math.round(h * k); const g = c.getContext('2d'), W = c.width, H = c.height, m = 7;
  if (forma === 'losango') { g.translate(W / 2, H / 2); g.rotate(Math.PI / 4); const L = W * 0.68; g.fillStyle = fundo; g.fillRect(-L / 2, -L / 2, L, L); g.lineWidth = 7; g.strokeStyle = borda; g.strokeRect(-L / 2 + 8, -L / 2 + 8, L - 16, L - 16); g.setTransform(1, 0, 0, 1, 0, 0); }
  else { g.fillStyle = fundo; g.fillRect(0, 0, W, H); g.lineWidth = 5; g.strokeStyle = borda; g.strokeRect(m, m, W - 2 * m, H - 2 * m); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; const total = linhas.reduce((a, l) => a + l.s * 1.22, 0); let y = H / 2 - total / 2;
  for (const l of linhas) { let s = l.s; g.font = `${l.p || 600} ${s}px ${FONTE}`; while (g.measureText(l.t).width > W - 4 * m - (forma ? W * 0.3 : 0) && s > 9) { s -= 1; g.font = `${l.p || 600} ${s}px ${FONTE}`; }   // encolhe até caber: texto cortado é defeito
    g.fillStyle = l.c || '#fff'; y += l.s * 0.61; g.fillText(l.t, W / 2, y); y += l.s * 0.61; }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// monta poste(s) + placa, virada para `rumo` (ângulo em y; 0 = olhando para +z)
function placa(x, z, rumo, w, h, altura, tex, postes, chaoY) {
  const g = new THREE.Group(); g.position.set(x, chaoY, z); g.rotation.y = rumo;
  const frente = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); frente.position.set(0, altura, 0.04); g.add(frente);
  const verso = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matVerso); verso.rotation.y = Math.PI; verso.position.set(0, altura, -0.04); if (!tex.losango) g.add(verso);
  for (const px of postes) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.13, altura + h / 2, 0.13), matPoste); p.position.set(px, (altura + h / 2) / 2, -0.06); g.add(p); }
  scene.add(g); return g;
}
const resumo = (b) => { const sp = (CAT.bairros[b] || []).filter(s => s.natureza === 'spec'); return { total: sp.length, ok: sp.filter(s => s.classe === 'ok').length }; };
const comprimento = (pts) => pts.reduce((a, pt, i) => (i ? a + Math.hypot(pt[0] - pts[i - 1][0], pt[1] - pts[i - 1][1]) : 0), 0), Y = C.Y_CALCADA, P = C.P;

function montar() {
  // 1) entrada de cada bairro: pórtico na calçada do quarteirão do canto sudoeste, virado para quem chega pelo sul
  for (const b of BAIRROS) { const r = resumo(b.id), cor = hex(b.cor), [i0, j0, , lins] = b.grade;
    const tex = rosto([{ t: b.nome.toUpperCase(), p: 800, s: 46, c: cor }, { t: b.sub, p: 400, s: 22, c: '#c9d6e6' }, { t: r.total ? `${r.total} specs · ${r.ok} aprovadas ou implementadas` : 'sem spec gravada', p: 600, s: 21, c: '#ffffff' }], '#0a1424', cor, 10, 2.9);
    const g = placa(i0 * P, (j0 + lins - 1) * P + 5.2, 0, 10, 2.9, 7.4, tex, [-4.5, 4.5], Y); (b.objs = b.objs || []).push(g); }

  // 2) na calçada em frente a cada prédio: à esquerda da porta, a placa com o nome (ou o losango de desvio); à direita, a placa de saídas
  for (const p of PREDIOS) { const v = vivos[p.id]; if (!v) continue; v.extras = v.extras || []; const z = p.p[1] + p.f[1] / 2 + 0.8, meia = Math.min(3.2, p.f[0] / 2 - 0.6);
    if (p.tipo === 'desvio') { const f = FLUXO[p.id], volta = f && f.volta ? PREDIO[f.volta.para] : null; const los = rosto([{ t: 'DESVIO', p: 800, s: 22, c: '#1a1304' }], '#f4c542', '#1a1304', 1.9, 1.9, 'losango'); los.losango = true;
      v.extras.push(placa(p.p[0] - meia, z, 0, 1.9, 1.9, 3.6, los, [0], Y));
      v.extras.push(placa(p.p[0] + meia - 0.6, z, 0, 3.4, 1.0, 3.0, rosto([{ t: p.nome, p: 800, s: 24, c: '#1a1304' }, { t: volta ? `volta para ${volta.nome}` : 'reprocessar', p: 600, s: 17, c: '#3a2c08' }], '#f4c542', '#1a1304', 3.4, 1.0), [-1.4, 1.4], Y)); continue; }
    v.extras.push(placa(p.p[0] - meia, z, 0, 3.9, 1.05, 3.4, rosto([{ t: (p.n ? p.n + ' · ' : '') + p.nome, p: 800, s: 27 }, { t: p.ext ? p.subn || 'fora da cidade' : BAIRRO[p.bairro].nome, p: 500, s: 17, c: '#d5e6fb' }], p.ext ? '#3a4558' : '#16488f', '#ffffff', 3.9, 1.05), [-1.7, 1.7], Y));
    // saídas: para onde os operários deste prédio seguem, com a distância pela malha de ruas
    const saidas = Object.values(ROTAS).filter(r => r.de === p.id && !r.semTrafego && PREDIO[r.para].tipo !== 'desvio').map(r => ({ nome: PREDIO[r.para].nome, m: Math.round(comprimento(r.pts)) })).sort((a, b) => a.m - b.m).slice(0, 4);
    if (saidas.length) { const h = 0.5 + saidas.length * 0.46; v.extras.push(placa(p.p[0] + meia, z, 0, 3.9, h, 3.0 + h / 2, rosto(saidas.map(x => ({ t: `→ ${x.nome} · ${x.m} m`, p: 600, s: 20 })), '#0f6b4a', '#ffffff', 3.9, h), [-1.7, 1.7], Y)); } }
}
// o texto precisa da fonte carregada para sair certo no canvas
if (document.fonts && document.fonts.ready) { Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]).then(montar, montar); } else montar();
})();
