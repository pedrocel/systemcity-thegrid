// SystemCity — obras: cada atividade combinada numa ata aparece como uma obra (guindaste e tapume) no bairro que ela afeta.
// Marcou como feita, a obra termina com um brilho e some. Clicar na obra abre a ficha da atividade.
(() => {
'use strict';
const C = window.CID, THREE = window.THREE; if (!C || !C.encontros || !THREE) return;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = C.P, obras = new Map();   // atividade.id -> { g, a, alvoY }
const LARANJA = 0xff8a3c;

// quarteirões livres de cada bairro (sem estação, desvio, serviço nem torre): é onde as obras entram
function livres(b) {
  const [i0, j0, cols, lins] = b.grade, ocupados = new Set(C.PREDIOS.filter(p => p.bairro === b.id).map(p => p.q.join(','))); ocupados.add(b.torre.join(','));
  const l = []; for (let i = i0; i < i0 + cols; i++) for (let j = j0; j < j0 + lins; j++) if (!ocupados.has(`${i},${j}`)) l.push([i, j]);
  return l;
}
function placa(texto) { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,138,60,.92)'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#1a0a02'; g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('OBRA', 256, 26); g.font = '500 24px system-ui, sans-serif'; g.fillText(texto.length > 34 ? texto.slice(0, 33) + '…' : texto, 256, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); s.scale.set(8, 1.5, 1); s.renderOrder = 9; return s; }
function construir(a, q) {
  const g = new THREE.Group(), [x, z] = [q[0] * P, q[1] * P], y = C.Y_CALCADA; g.position.set(x, 0, z);
  const tapume = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: LARANJA, emissiveIntensity: 0.25, roughness: 0.9 })); tapume.position.y = y + 0.6; g.add(tapume);
  const listra = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.25, 8.1), new THREE.MeshBasicMaterial({ color: LARANJA })); listra.position.y = y + 1.2; g.add(listra);
  const mastro = new THREE.Mesh(new THREE.BoxGeometry(0.5, 11, 0.5), new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: LARANJA, emissiveIntensity: 0.6 })); mastro.position.set(-2.5, y + 5.5, 2.5); g.add(mastro);
  const lanca = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 0.4), mastro.material); lanca.position.set(1.5, y + 10.8, 2.5); g.add(lanca); g.userData.lanca = lanca;
  const cabo = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd9b8 })); cabo.position.set(5.5, y + 8.2, 2.5); g.add(cabo); g.userData.cabo = cabo;
  const bloco = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a5a2a })); bloco.position.set(5.5, y + 5.3, 2.5); g.add(bloco); g.userData.bloco = bloco;
  const andaime = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(5, 4, 5)), new THREE.LineBasicMaterial({ color: LARANJA, transparent: true, opacity: 0.8 })); andaime.position.set(0.5, y + 3.2, -0.5); g.add(andaime);
  const p = placa(a.titulo); p.position.set(0, y + 13.2, 0); g.add(p);
  const luz = new THREE.PointLight(LARANJA, 0.9, 22); luz.position.set(0, y + 6, 0); g.add(luz);
  for (const m of [tapume, mastro, lanca, bloco]) m.userData.obra = a.id;
  C.solidos.push({ x, z, w: 8, d: 8, h: 2, obra: a.id });
  C.scene.add(g); return g;
}
async function carregar() {
  let lista; try { lista = await C.encontros.api('GET', `/api/obras?bairros=${encodeURIComponent(C.BAIRROS.map(b => b.id).join(','))}`); } catch { return; }
  const ids = new Set(lista.map(a => a.id)); for (const [id, o] of obras) if (!ids.has(id)) terminar(id);
  const usados = new Set([...obras.values()].map(o => o.q.join(',')));
  for (const a of lista) { if (obras.has(a.id)) continue; const b = C.BAIRRO[a.bairro]; if (!b) continue;
    const q = livres(b).find(x => !usados.has(x.join(','))); if (!q) continue; usados.add(q.join(','));
    obras.set(a.id, { g: construir(a, q), a, q, nasceu: performance.now() }); }
  atualizarBotao();
}
function terminar(id) { const o = obras.get(id); if (!o || o.fim) return; o.fim = performance.now(); }
function quadro(agora) {
  requestAnimationFrame(quadro); const t = agora / 1000;
  for (const [id, o] of obras) {
    const u = o.g.userData; u.lanca.rotation.y = Math.sin(t * 0.5 + id) * 0.8;
    u.cabo.position.set(-2.5 + 8 * Math.cos(u.lanca.rotation.y), u.cabo.position.y, 2.5 - 8 * Math.sin(u.lanca.rotation.y)); u.bloco.position.set(u.cabo.position.x, C.Y_CALCADA + 5.3 + Math.sin(t * 1.3 + id) * 1.2, u.cabo.position.z);
    if (!o.fim) o.g.scale.setScalar(Math.min(1, Math.max(0.01, (performance.now() - o.nasceu) / 600)));   // nasce crescendo
    if (o.fim) { const k = (performance.now() - o.fim) / 900; if (k >= 1) { C.scene.remove(o.g); obras.delete(id); const i = C.solidos.findIndex(x => x.obra === id); if (i >= 0) C.solidos.splice(i, 1); atualizarBotao(); } else o.g.scale.setScalar(Math.max(0.01, 1 - k)); }
  }
}
// a ficha da obra, no mesmo painel das fichas da cidade
function ficha(id) { const o = obras.get(id); if (!o) return; const a = o.a, el = $('#ficha'); if (!el) return; el.hidden = false;
  el.innerHTML = `<button class="x" aria-label="Fechar" onclick="this.parentElement.hidden=true">✕</button><div class="tipo" style="--cb:#ff8a3c">Obra · ${esc((C.BAIRRO[a.bairro] || {}).nome || a.bairro)}</div><h3>${esc(a.titulo)}</h3>
    <div class="sub">${a.responsavel ? 'responsável: ' + esc(a.responsavel) : 'sem responsável'}${a.prazo ? ' · prazo: ' + esc(a.prazo) : ''}</div>${a.descricao ? `<p>${esc(a.descricao)}</p>` : ''}
    <p class="nota">Combinado em ${esc(a.sala_nome === 'direta' ? 'uma conversa' : a.sala_nome)} · ${new Date(a.criada).toLocaleDateString('pt-BR')}${a.ticket ? ` · <a href="${esc(a.ticket)}" target="_blank" rel="noopener">ticket</a>` : ''}</p>
    <button class="bt forte cheio" id="obra-feita">Marcar como feita</button>`;
  $('#obra-feita').onclick = async () => { try { await C.encontros.api('PATCH', `/api/atividades/${a.id}`, { feita: true }); el.hidden = true; terminar(a.id); } catch (e) { alert(e.message); } };
}
const botao = document.createElement('button'); botao.className = 'bt'; botao.id = 'b-obras'; botao.hidden = true; $('.barra').insertBefore(botao, $('#b-encontros'));
function atualizarBotao() { botao.hidden = !obras.size; botao.innerHTML = `Obras<span class="cont">${obras.size}</span>`; }
botao.addEventListener('click', () => { const o = [...obras.values()][0]; if (o) C.api.olharPara(o.g.position.x, o.g.position.z, 60); });
// clique numa obra: raio próprio, só contra as peças das obras (o resto da cidade segue com o clique dela)
const raio = new THREE.Raycaster(), ponto = new THREE.Vector2();
C.canvas.addEventListener('click', (e) => { if (!obras.size) return; const r = C.canvas.getBoundingClientRect(); ponto.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raio.setFromCamera(ponto, C.camera); const pecas = [...obras.values()].flatMap(o => o.g.children.filter(m => m.userData.obra)), h = raio.intersectObjects(pecas, false)[0];
  if (h) { e.stopImmediatePropagation(); ficha(h.object.userData.obra); } }, true);
C.encontros.ouvir((m) => { if (m.t === 'atividade' || m.t === 'ata') carregar(); });
C.encontros.aoEntrar(() => carregar());
if (C.encontros.eu()) carregar();
C.obras = { lista: () => [...obras.values()].map(o => ({ id: o.a.id, titulo: o.a.titulo, bairro: o.a.bairro, responsavel: o.a.responsavel, prazo: o.a.prazo })), recarregar: carregar };
requestAnimationFrame(quadro);
})();
