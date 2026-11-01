// Leitor de documentos da SystemCity: lista as specs de um bairro (do catálogo gerado) e mostra o markdown.
// O texto de cada bairro só é baixado quando o bairro é aberto (textos-<bairro>.js).
(() => {
'use strict';
const CAT = window.CIDADE_SPECS || { bairros: {}, repos: [] };
const BASE = window.SYSTEMCITY_BASE || '';   // pasta da cidade: os textos ficam em <pasta>/textos-<bairro>.js
const ROT = { ok: 'aprovada ou implementada', andamento: 'em revisão ou rascunho', sem: 'sem status declarado', antigo: 'substituída' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const porCaminho = {}; for (const [b, l] of Object.entries(CAT.bairros)) for (const s of l) for (const d of s.docs) porCaminho[d.caminho] = { b, s, d };

const css = document.createElement('style'); css.textContent = `
#leitor { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 14px; background: rgba(3, 7, 14, .62); }
#leitor .cx { width: min(1240px, 100%); height: 100%; display: grid; grid-template-rows: auto 1fr; background: rgba(8, 14, 26, .97); border: 1px solid var(--linha-forte); border-radius: 5px; overflow: hidden; }
#leitor header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 12px 14px; border-bottom: 1px solid var(--linha); }
#leitor header h2 { margin: 0; font: 800 18px var(--titulo); } #leitor header h2 small { font: 400 12px var(--texto); color: var(--tinta-2); margin-left: 8px; }
#leitor header .esp { flex: 1; }
#leitor input { height: 32px; min-width: 0; width: 220px; padding: 0 10px; border: 1px solid var(--linha-forte); border-radius: 3px; background: rgba(126, 168, 220, .06); color: var(--tinta); font: inherit; }
#leitor input:focus-visible { outline: 2px solid var(--marca); outline-offset: 1px; }
#leitor .corpo { display: grid; grid-template-columns: 340px 1fr; min-height: 0; }
#leitor .lista { overflow: auto; border-right: 1px solid var(--linha); padding: 6px; scrollbar-width: thin; }
#leitor .grupo { margin: 10px 8px 4px; font: 600 10.5px var(--titulo); letter-spacing: .14em; text-transform: uppercase; color: var(--tinta-3); }
#leitor .it { display: grid; grid-template-columns: 10px 1fr; gap: 3px 9px; width: 100%; padding: 8px; border: 1px solid transparent; border-radius: 3px; background: none; text-align: left; cursor: pointer; }
#leitor .it:hover { background: rgba(126, 168, 220, .08); } #leitor .it:focus-visible { outline: 2px solid var(--marca); outline-offset: -2px; }
#leitor .it.on { background: rgba(63, 169, 245, .14); border-color: var(--linha-forte); }
#leitor .it i { width: 9px; height: 9px; margin-top: 5px; border-radius: 1px; background: var(--c); box-shadow: 0 0 8px var(--c); }
#leitor .it b { font-weight: 500; color: var(--tinta); overflow-wrap: anywhere; } #leitor .it small { grid-column: 2; color: var(--tinta-3); font: 400 10.5px var(--mono); overflow-wrap: anywhere; }
#leitor .doc { overflow: auto; padding: 0 22px 40px; scrollbar-width: thin; min-width: 0; }
#leitor .abas { position: sticky; top: 0; display: flex; gap: 4px; overflow-x: auto; padding: 10px 0 8px; background: rgba(8, 14, 26, .97); border-bottom: 1px solid var(--linha); z-index: 1; }
#leitor .aba { flex: none; height: 28px; padding: 0 10px; border: 1px solid var(--linha); border-radius: 3px; background: none; cursor: pointer; font-size: 12px; color: var(--tinta-2); white-space: nowrap; }
#leitor .aba.on { border-color: var(--marca); color: #fff; background: rgba(63, 169, 245, .16); } #leitor .aba:focus-visible { outline: 2px solid var(--marca); }
#leitor .meta { margin: 10px 0 0; font: 400 11px var(--mono); color: var(--tinta-3); overflow-wrap: anywhere; } #leitor .meta span { color: var(--c, var(--tinta-2)); }
#leitor .vazio { padding: 40px 0; color: var(--tinta-2); }
.md { max-width: 86ch; color: var(--tinta); font-size: 13.5px; line-height: 1.6; overflow-wrap: anywhere; }
.md h1 { font: 800 23px/1.2 var(--titulo); margin: 18px 0 8px; text-wrap: balance; } .md h2 { font: 800 17px/1.25 var(--titulo); margin: 26px 0 8px; padding-top: 12px; border-top: 1px solid var(--linha); }
.md h3 { font: 600 14.5px var(--titulo); margin: 20px 0 6px; } .md h4, .md h5 { font: 600 13px var(--texto); margin: 16px 0 4px; color: var(--tinta-2); }
.md p, .md ul, .md ol { margin: 8px 0; } .md li { margin: 3px 0; } .md a { color: var(--marca); }
.md code { font: 400 12px var(--mono); background: rgba(126, 168, 220, .12); padding: 1px 4px; border-radius: 2px; }
.md pre { overflow-x: auto; padding: 10px 12px; background: rgba(0, 0, 0, .4); border: 1px solid var(--linha); border-radius: 3px; } .md pre code { background: none; padding: 0; }
.md blockquote { margin: 10px 0; padding: 2px 12px; border-left: 3px solid var(--linha-forte); color: var(--tinta-2); }
.md .tabela { overflow-x: auto; margin: 10px 0; } .md table { border-collapse: collapse; font-size: 12.5px; } .md th, .md td { border: 1px solid var(--linha); padding: 5px 8px; text-align: left; vertical-align: top; } .md th { background: rgba(126, 168, 220, .1); font-weight: 600; }
.md hr { border: 0; border-top: 1px solid var(--linha); margin: 18px 0; } .md input[type=checkbox] { width: auto; height: auto; }
@media (max-width: 860px) { #leitor { padding: 0; } #leitor .corpo { grid-template-columns: 1fr; grid-template-rows: 38% 1fr; } #leitor .lista { border-right: 0; border-bottom: 1px solid var(--linha); } #leitor input { width: 100%; } #leitor .doc { padding: 0 16px 30px; } }
`; document.head.appendChild(css);

const el = document.createElement('div'); el.id = 'leitor'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Specs do bairro');
el.innerHTML = `<div class="cx"><header><h2 id="l-tit"></h2><span class="esp"></span><input id="l-busca" type="search" placeholder="Buscar spec, RN, ticket…" aria-label="Buscar nas specs deste bairro"><div class="seg" role="group" aria-label="Tipo de documento"><button class="bt" data-nat="" aria-pressed="true">Tudo</button><button class="bt" data-nat="spec">Specs</button><button class="bt" data-nat="adr">ADRs</button></div><button class="bt" id="l-fecha">Fechar</button></header><div class="corpo"><div class="lista" id="l-lista"></div><div class="doc" id="l-doc"></div></div></div>`;
(document.getElementById('app') || document.body).appendChild(el);
const $ = (s) => el.querySelector(s);
let bairro = null, nome = '', corDe = {}, specAtual = null, docAtual = null, nat = '', quemAbriu = null;
const COR = { ok: '#5fd38d', andamento: '#f4c542', sem: '#6b7f99', antigo: '#6b7f99' };

function carregar(b) {
  return new Promise((ok) => { if ((window.CIDADE_TEXTOS || {})[b]) return ok(true); const s = document.createElement('script'); s.src = `${BASE}textos-${b}.js`; s.onload = () => ok(true); s.onerror = () => ok(false); document.head.appendChild(s); });
}
function listar() {
  const q = $('#l-busca').value.trim().toLowerCase(), todas = CAT.bairros[bairro] || [];
  const ve = todas.filter(s => (!nat || s.natureza === nat) && (!q || (s.titulo + ' ' + s.slug + ' ' + (s.status || '') + ' ' + s.repos.join(' ')).toLowerCase().includes(q)));
  const grupo = (n, rot) => { const l = ve.filter(s => s.natureza === n); return l.length ? `<div class="grupo">${rot} · ${l.length}</div>` + l.map(s => `<button class="it ${specAtual === s ? 'on' : ''}" data-id="${esc(s.id)}" style="--c:${COR[s.classe]}"><i title="${ROT[s.classe]}"></i><b>${esc(s.titulo)}</b><small>${esc(s.status || 'sem status')}${s.rn ? ` · ${s.rn} RN` : ''}${s.ca ? ` · ${s.ca} CA` : ''} · ${s.docs.length} doc${s.docs.length > 1 ? 's' : ''}</small><small>${esc(s.repos.join(' · '))}</small></button>`).join('') : ''; };
  $('#l-lista').innerHTML = (grupo('spec', 'Specs') + grupo('adr', 'Decisões de arquitetura (ADR)')) || '<p class="vazio" style="padding:20px 8px">Nada encontrado com esse filtro.</p>';
}
function mostrar(s, d) {
  specAtual = s; docAtual = d || s.docs[0]; listar();
  const r = (CAT.repos || []).find(x => x.repo === docAtual.repo) || {}, md = ((window.CIDADE_TEXTOS || {})[s.bairro] || {})[docAtual.chave];
  const abas = s.docs.length > 1 ? `<div class="abas">${s.docs.map((x, i) => `<button class="aba ${x === docAtual ? 'on' : ''}" data-doc="${i}">${esc(x.tipo)}${s.repos.length > 1 ? ' · ' + esc(x.repo) : ''}${s.docs.filter(y => y.tipo === x.tipo && y.repo === x.repo).length > 1 ? ' · ' + esc(x.caminho.split('/').pop().replace(/\.md$/, '')) : ''}</button>`).join('')}</div>` : '';
  let corpo;
  if (md == null) corpo = '<p class="vazio">O texto deste bairro não pôde ser carregado.</p>';
  else if (window.marked && window.DOMPurify) corpo = `<div class="md">${window.DOMPurify.sanitize(window.marked.parse(md.replace(/^---\n[\s\S]*?\n---\n/, ''))).replace(/<table>/g, '<div class="tabela"><table>').replace(/<\/table>/g, '</table></div>')}</div>`;
  else corpo = `<pre class="md" style="white-space:pre-wrap">${esc(md)}</pre>`;
  $('#l-doc').innerHTML = `${abas}<p class="meta" style="--c:${COR[s.classe]}">${esc(docAtual.caminho)} · ${esc(r.branch || '?')} (${esc(r.commit || '?')}) · <span>${esc(docAtual.status || s.status || 'sem status declarado')}</span>${docAtual.versao ? ' · v' + esc(docAtual.versao) : ''}</p>${corpo}`;
  $('#l-doc').scrollTop = 0;
}
async function abrir(b, alvo, rotulo, cor) {
  quemAbriu = document.activeElement; bairro = b; nome = rotulo || b; nat = ''; specAtual = null; $('#l-busca').value = '';
  el.querySelectorAll('[data-nat]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.nat === '')));
  const l = CAT.bairros[b] || [], sp = l.filter(s => s.natureza === 'spec'), c = (k) => sp.filter(s => s.classe === k).length;
  $('#l-tit').innerHTML = `<span style="color:${cor || 'inherit'}">${esc(nome)}</span><small>${sp.length} specs · ${l.length - sp.length} ADRs · ${c('ok')} aprovadas ou implementadas · ${c('andamento')} em revisão</small>`;
  el.hidden = false; listar(); $('#l-doc').innerHTML = '<p class="vazio">Carregando os textos do bairro…</p>';
  await carregar(b);
  const s = (alvo && l.find(x => x.id === alvo || (x.slug === alvo && x.natureza === 'spec'))) || l[0];
  if (s) mostrar(s); else $('#l-doc').innerHTML = '<p class="vazio">Este bairro ainda não tem spec gravada no repositório.</p>';
  const on = $('.it.on'); if (on) on.scrollIntoView({ block: 'center' }); $('#l-busca').focus();
}
function fechar() { el.hidden = true; if (quemAbriu && quemAbriu.focus) quemAbriu.focus(); }

$('#l-fecha').addEventListener('click', fechar);
el.addEventListener('click', (e) => { if (e.target === el) fechar(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { e.stopPropagation(); fechar(); } }, true);
$('#l-busca').addEventListener('input', listar);
el.querySelectorAll('[data-nat]').forEach(b => b.addEventListener('click', () => { nat = b.dataset.nat; el.querySelectorAll('[data-nat]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); listar(); }));
$('#l-lista').addEventListener('click', (e) => { const b = e.target.closest('.it'); if (!b) return; const s = (CAT.bairros[bairro] || []).find(x => x.id === b.dataset.id); if (s) mostrar(s); });
$('#l-doc').addEventListener('click', async (e) => {
  const aba = e.target.closest('.aba'); if (aba) { mostrar(specAtual, specAtual.docs[+aba.dataset.doc]); return; }
  const a = e.target.closest('a'); if (!a) return; const href = a.getAttribute('href') || ''; e.preventDefault();
  if (/^https?:/i.test(href)) { window.open(href, '_blank', 'noopener'); return; }
  if (href.startsWith('#') || !docAtual) return;
  const partes = docAtual.caminho.split('/').slice(0, -1); for (const p of href.split('#')[0].split('/')) { if (p === '..') partes.pop(); else if (p && p !== '.') partes.push(p); }
  const achou = porCaminho[partes.join('/')]; if (!achou) return;
  if (achou.b !== bairro) { bairro = achou.b; await carregar(achou.b); }
  mostrar(achou.s, achou.d);
});

window.LeitorSpecs = { abrir, fechar, aberto: () => !el.hidden };
})();
