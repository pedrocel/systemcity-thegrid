// SystemCity — auditoria do código. Agentes do Claude revisam o repositório por foco (segurança, bugs, desempenho, robustez);
// cada bairro com problema ganha um farol (vermelho se há algo crítico ou alto) e o painel lista os achados.
// Clicar num achado voa até o bairro; "Corrigir com o agente" abre uma sessão do agente de código já com o problema descrito.
(() => {
'use strict';
const C = window.CID, SLUG = window.SYSTEMCITY_SLUG; if (!C || !C.encontros || !SLUG) return;
const $ = (s) => document.querySelector(s), ENC = C.encontros;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FOCOS = { seguranca: 'Segurança', bugs: 'Bugs', desempenho: 'Desempenho', robustez: 'Robustez' }, SEV = { critica: ['Crítica', '#ff4d5e'], alta: ['Alta', '#ff8a3c'], media: ['Média', '#ffd166'], baixa: ['Baixa', '#8fb3d9'] };
const AU = { dados: null, filtro: 'todos', faroIs: [], relogio: null };

document.getElementById('app').insertAdjacentHTML('beforeend', `<section class="enc vidro audit" id="auditoria" aria-label="Auditoria do código" hidden>
  <div class="audit-cab"><b>Auditoria do código</b><span class="rp-esp"></span><button class="bt" id="au-rodar">Revisar de novo</button><button class="bt" id="au-fechar" aria-label="Fechar">✕</button></div>
  <div class="audit-corpo" id="au-corpo"></div></section>`);
const caixa = $('#auditoria'), bt = document.createElement('button'); bt.className = 'bt'; bt.id = 'b-auditoria'; bt.textContent = 'Auditoria'; bt.title = 'Agentes revisam o código atrás de falhas';
$('.barra').insertBefore(bt, $('#b-encontros')); bt.hidden = true; ENC.aoEntrar(() => { bt.hidden = false; carregar(); }); if (ENC.eu()) { bt.hidden = false; carregar(); }

function farol(b, n, cor) {   // coluna de luz e placa sobre o bairro
  const g = new THREE.Group(), [x, z] = b.c, tam = Math.max(b.s[0], b.s[1]), alto = tam * 0.9, r = tam / 26;   // na escala do bairro
  const luz = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 1.3, alto, 16, 1, true), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.35, depthWrite: false }));
  luz.position.y = alto / 2; g.add(luz);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const k = c.getContext('2d'); k.fillStyle = '#' + cor.toString(16).padStart(6, '0'); k.beginPath(); k.roundRect(0, 0, 256, 96, 18); k.fill();
  k.fillStyle = '#12060a'; k.font = '800 44px system-ui, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(`⚠ ${n}`, 128, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); s.scale.set(tam / 4, tam / 4 * 0.375, 1); s.position.y = alto + tam / 14; s.renderOrder = 10; g.add(s);
  g.position.set(x, 0, z); g.userData.luz = luz; C.scene.add(g); return g;
}
function desenharFarois() {
  for (const g of AU.faroIs) C.scene.remove(g); AU.faroIs = [];
  const porBairro = {}; for (const a of (AU.dados && AU.dados.achados) || []) if (a.bairro && C.BAIRRO[a.bairro]) (porBairro[a.bairro] = porBairro[a.bairro] || []).push(a);
  for (const [id, l] of Object.entries(porBairro)) AU.faroIs.push(farol(C.BAIRRO[id], l.length, l.some(a => a.severidade === 'critica' || a.severidade === 'alta') ? 0xff4d5e : 0xffd166));
}
(function pulsar(t) { requestAnimationFrame(pulsar); for (const g of AU.faroIs) g.userData.luz.material.opacity = 0.22 + 0.18 * Math.sin(t / 300); })(0);

async function carregar() {
  try { AU.dados = await ENC.api('GET', `/api/cidades/${SLUG}/auditoria`); } catch { return; }
  const d = AU.dados, ruins = d ? d.achados.filter(a => a.severidade === 'critica' || a.severidade === 'alta').length : 0;
  bt.textContent = d && d.estado === 'rodando' ? 'Auditoria…' : ruins ? `Auditoria · ${ruins}` : 'Auditoria'; bt.classList.toggle('alerta', !!ruins);
  desenharFarois(); desenhar();
  clearTimeout(AU.relogio); if (d && d.estado === 'rodando') AU.relogio = setTimeout(carregar, 4000);
}
function desenhar() {
  if (caixa.hidden) return; const d = AU.dados, corpo = $('#au-corpo');
  if (!d) { corpo.innerHTML = '<p class="rp-nota">Esta cidade ainda não foi revisada. Quatro agentes leem o código, cada um atrás de um tipo de problema: segurança, bugs, desempenho e robustez.</p><button class="bt forte" id="au-primeira">Revisar o código</button>'; $('#au-primeira').onclick = rodar; return; }
  if (d.estado === 'rodando') { const p = d.progresso || {}; corpo.innerHTML = `<p class="rp-nota">Os agentes estão revisando${p.lidos ? ` ${p.lidos} arquivos` : ''}… ${p.total ? `${p.feitos} de ${p.total} revisões prontas.` : 'lendo o repositório.'}</p><div class="au-barra"><i style="width:${p.total ? Math.round(p.feitos / p.total * 100) : 5}%"></i></div>`; return; }
  if (d.estado === 'falhou') { corpo.innerHTML = `<p class="enc-erro">A revisão falhou: ${esc(d.erro)}</p>`; return; }
  const cont = (f) => d.achados.filter(a => f === 'todos' || a.foco === f).length, lista = d.achados.filter(a => AU.filtro === 'todos' || a.foco === AU.filtro);
  corpo.innerHTML = `<p class="rp-nota">${d.arquivos} arquivos revisados em ${new Date(d.terminada).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${d.erro ? ` · ${esc(d.erro)}` : ''}</p>
    <div class="seg au-filtros">${['todos', ...Object.keys(FOCOS)].map(f => `<button class="bt" data-f="${f}" aria-pressed="${AU.filtro === f}">${f === 'todos' ? 'Todos' : FOCOS[f]} ${cont(f)}</button>`).join('')}</div>
    ${lista.length ? lista.map(a => `<article class="au-item" data-a="${a.id}"><header><b class="au-sev" style="--c:${SEV[a.severidade][1]}">${SEV[a.severidade][0]}</b><span>${esc(FOCOS[a.foco])}</span>${a.bairro && C.BAIRRO[a.bairro] ? `<span>· ${esc(C.BAIRRO[a.bairro].nome)}</span>` : ''}</header>
      <h4>${esc(a.titulo)}</h4><code>${esc(a.arquivo)}${a.linha ? ':' + a.linha : ''}</code><p>${esc(a.explicacao)}</p>${a.sugestao ? `<p class="au-sug"><b>Como corrigir:</b> ${esc(a.sugestao)}</p>` : ''}
      <button class="bt" data-corrigir="${a.id}">Corrigir com o agente</button></article>`).join('') : '<p class="rp-nota">Nenhum problema encontrado aqui. 🎉</p>'}`;
  corpo.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { AU.filtro = b.dataset.f; desenhar(); });
  corpo.querySelectorAll('.au-item').forEach(el => el.onclick = (ev) => { if (ev.target.closest('button')) return; const a = d.achados.find(x => x.id === +el.dataset.a), b = a && C.BAIRRO[a.bairro]; if (b) C.api.olharPara(b.c[0], b.c[1], Math.max(b.s[0], b.s[1]) + 30); });
  corpo.querySelectorAll('[data-corrigir]').forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = 'Chamando o agente…';
    try { const s = await ENC.api('POST', `/api/cidades/${SLUG}/auditoria/${d.id}/achados/${b.dataset.corrigir}/corrigir`, {}); caixa.hidden = true; if (C.agente) C.agente.sessao(s.id); }
    catch (e) { b.disabled = false; b.textContent = 'Corrigir com o agente'; alert(e.message); } });
}
async function rodar() { try { AU.dados = await ENC.api('POST', `/api/cidades/${SLUG}/auditoria`, {}); } catch (e) { return alert(e.message); } carregar(); }
bt.onclick = () => { caixa.hidden = !caixa.hidden; if (!caixa.hidden) { desenhar(); carregar(); } };
$('#au-fechar').onclick = () => { caixa.hidden = true; }; $('#au-rodar').onclick = rodar;
})();
