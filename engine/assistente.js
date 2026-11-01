// SystemCity — "Pergunte para a cidade": um painel de perguntas. O navegador manda ao servidor o mapa como está agora
// (bairros, prédios, filas, estados), o Claude responde e a câmera voa até o prédio de que ele fala.
(() => {
'use strict';
const C = window.CID; if (!C || !C.encontros) return;
const $ = (s, r = document) => s === '' ? r : r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (t) => (window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(t)) : `<p>${esc(t)}</p>`);
const historico = [];

const barra = $('.barra'), botao = document.createElement('button');
botao.className = 'bt'; botao.id = 'b-perguntar'; botao.textContent = 'Perguntar'; botao.hidden = true; botao.title = 'Pergunte qualquer coisa sobre esta cidade';
barra.insertBefore(botao, $('#b-encontros') || barra.querySelector('#b-pausa'));
document.getElementById('app').insertAdjacentHTML('beforeend', `
  <aside class="enc ask vidro" id="assistente" aria-label="Pergunte para a cidade" hidden>
    <div class="enc-cab"><b>Pergunte para a cidade</b><label class="ask-modo" id="ask-modo" hidden><input type="checkbox" id="ask-codigo"> no código</label><button class="bt" id="ask-fecha" aria-label="Fechar">✕</button></div>
    <div class="enc-corpo" id="ask-corpo"><p class="enc-vazio">Pergunte por que um bairro está vermelho, o que um prédio faz, por onde passa um pedido, quem cuida de quê… O Claude responde olhando a cidade e os documentos dela, e a câmera voa até o lugar.</p>
      <div class="ask-sugestoes"><button class="bt" data-q="Me dá uma visão geral desta cidade em 4 frases.">Visão geral</button><button class="bt" data-q="Qual prédio está com a maior fila agora e por quê?">Maior fila</button><button class="bt" data-q="Por onde passa um item do começo ao fim no bairro em foco?">Caminho do item</button><button class="bt" data-q="Quais são os pontos de falha desta arquitetura?">Pontos de falha</button></div></div>
    <form class="enc-form linha" id="ask-form" style="padding:10px"><input name="q" maxlength="1000" autocomplete="off" placeholder="Pergunte algo…" aria-label="Pergunta"><button class="bt forte">Perguntar</button></form>
  </aside>`);
const painel = $('#assistente'), corpo = $('#ask-corpo'), form = $('#ask-form');
const mostrarBotao = () => { botao.hidden = $('#b-encontros') ? $('#b-encontros').hidden : true; };
new MutationObserver(mostrarBotao).observe($('#b-encontros') || document.body, { attributes: true, attributeFilter: ['hidden'] }); mostrarBotao();
botao.addEventListener('click', () => { if (!C.encontros.eu()) return C.encontros.pedirEntrada(); painel.hidden = !painel.hidden; botao.setAttribute('aria-pressed', String(!painel.hidden)); if (!painel.hidden) form.q.focus(); });
$('#ask-fecha').addEventListener('click', () => { painel.hidden = true; botao.setAttribute('aria-pressed', 'false'); });
corpo.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) { form.q.value = b.dataset.q; form.requestSubmit(); } });

// o mapa como está agora: o suficiente para o Claude responder, sem os textos longos (esses ficam no servidor)
function mapaAgora() {
  const fila = C.api.parados ? C.api.parados() : [], conta = {}; for (const n of fila) if (n.dentro) conta[n.dentro] = (conta[n.dentro] || 0) + 1;
  const vermelhos = new Set(fila.filter(n => n.emDesvio).map(n => n.dentro));
  return { titulo: document.title, bairroEmFoco: C.api.bairroAberto(),
    bairros: C.BAIRROS.map(b => ({ id: b.id, nome: b.nome, sub: b.sub, desc: b.desc, estacoes: (b.estacoes || []).map(e => e.id), desvios: (b.desvios || []).map(d => d.id) })),
    predios: C.PREDIOS.map(p => ({ id: p.id, nome: p.nome, tipo: p.tipo, bairro: p.bairro, desc: p.desc, entra: p.entra, sai: p.sai, fila: conta[p.id] || 0, ...(p.semaforo ? { semaforo: p.semaforo } : {}), ...(vermelhos.has(p.id) ? { estado: 'vermelho' } : {}), ...(p.incidente ? { incidente: p.incidente } : {}) })),
    rotas: Object.entries(C.ROTAS).map(([id, r]) => ({ id, de: r.de, para: r.para })),
    obras: (C.obras && C.obras.lista ? C.obras.lista() : []) };
}
// "no código": responde lendo o repositório, com citações de arquivo e linha; só em cidade gerada de um repositório
const slug = window.SYSTEMCITY_SLUG || null, api = (m, c, d) => C.encontros.api(m, `/api/cidades/${slug}/codigo${c}`, d), modo = $('#ask-modo'), noCodigo = $('#ask-codigo');
const avisar = (t) => { if (corpo.querySelector('.enc-vazio')) corpo.innerHTML = ''; corpo.insertAdjacentHTML('beforeend', `<div class="enc-msg"><small>código</small>${esc(t)}</div>`); corpo.scrollTop = corpo.scrollHeight; };
const fontesHtml = (l) => l.length ? `<ol class="ask-fontes">${l.map(f => { const t = `${esc(f.caminho)}:${f.ini}-${f.fim}`; return `<li value="${f.n}">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${t}</a>` : t}</li>`; }).join('')}</ol>` : '';
botao.addEventListener('click', () => { if (slug && C.encontros.eu()) api('GET', '').then(() => { modo.hidden = false; }).catch(() => {}); });
noCodigo.addEventListener('change', async () => { if (!noCodigo.checked) return; try { const s = await api('GET', '');
  if (s.estado === 'nunca' || s.estado === 'erro') { await api('POST', '/indexar', {}); avisar('Lendo o repositório. Em repositórios grandes isso leva alguns minutos; pode perguntar quando terminar.'); } else if (s.estado === 'indexando') avisar('O repositório ainda está sendo lido.'); else avisar(`${s.arquivos} arquivos lidos, ${s.trechos} trechos.`);
} catch (e) { avisar(e.message); noCodigo.checked = false; } });
form.addEventListener('submit', async (ev) => { ev.preventDefault(); const q = form.q.value.trim(); if (!q) return; form.q.value = ''; form.querySelector('button').disabled = true;
  if (corpo.querySelector('.enc-vazio')) corpo.innerHTML = '';
  corpo.insertAdjacentHTML('beforeend', `<div class="enc-msg minha">${esc(q)}</div><div class="enc-msg ask-pensando"><small>Claude</small>olhando a cidade…</div>`); corpo.scrollTop = corpo.scrollHeight;
  try { if (noCodigo.checked) { const r = await api('POST', '/perguntar', { pergunta: q }), el = corpo.querySelector('.ask-pensando'); el.classList.remove('ask-pensando'); el.innerHTML = `<small>código</small>${md(r.resposta)}${fontesHtml(r.fontes)}`; return; }
    const r = await C.encontros.api('POST', '/api/cidade/perguntar', { slug: window.SYSTEMCITY_SLUG || null, mapa: mapaAgora(), pergunta: q, historico });
    historico.push({ p: q, r: r.resposta }); const el = corpo.querySelector('.ask-pensando'); el.classList.remove('ask-pensando'); el.innerHTML = `<small>Claude</small>${md(r.resposta)}`;
    if (r.foco) { const nome = r.foco.tipo === 'b' ? (C.BAIRRO[r.foco.id] || {}).nome : (C.PREDIO[r.foco.id] || {}).nome; if (nome) { el.insertAdjacentHTML('beforeend', `<button class="bt ask-foco" data-t="${r.foco.tipo}" data-id="${esc(r.foco.id)}">Ver ${esc(nome)} →</button>`); C.api.escolher(r.foco.tipo, r.foco.id); } }
  } catch (e) { const el = corpo.querySelector('.ask-pensando'); el.classList.remove('ask-pensando'); el.innerHTML = `<small>erro</small>${esc(e.message)}`; }
  finally { form.querySelector('button').disabled = false; corpo.scrollTop = corpo.scrollHeight; form.q.focus(); } });
corpo.addEventListener('click', (e) => { const b = e.target.closest('.ask-foco'); if (b) C.api.escolher(b.dataset.t, b.dataset.id); });
C.assistente = { abrir: () => { painel.hidden = false; form.q.focus(); }, perguntar: (q) => { painel.hidden = false; form.q.value = q; form.requestSubmit(); } };
})();
