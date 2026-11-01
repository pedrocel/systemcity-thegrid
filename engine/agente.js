// SystemCity — o agente de código, dentro da cidade. O dev pede (apontando um bairro ou prédio), acompanha ao vivo o que o Claude
// lê e propõe, vê os diffs, conversa com ele e, quando aprovar, abre o Pull Request. Nada vai para o GitHub sem o clique do dev.
(() => {
'use strict';
const C = window.CID, SLUG = window.SYSTEMCITY_SLUG, UNI = window.SYSTEMCITY_UNIVERSO; if (!C || !C.encontros || !(SLUG || UNI)) return;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)], ENC = C.encontros;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (t) => (window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(t)) : `<p>${esc(t)}</p>`);
const A = { lista: [], aberta: null, repos: [] };   // repos: [{ slug, repo, nome }] (no universo, um por repositório)
const NOMES = { listar_pasta: 'listou', ler_arquivo: 'leu', buscar: 'buscou' };

document.getElementById('app').insertAdjacentHTML('beforeend', `<aside class="enc ag vidro" id="agente" aria-label="Agente de código" hidden>
  <div class="enc-cab"><b>Agente de código</b><button class="bt" id="ag-fecha" aria-label="Fechar">✕</button></div><div class="enc-corpo" id="ag-corpo"></div></aside>`);
const painel = $('#agente'), corpo = $('#ag-corpo'), bt = document.createElement('button');
bt.className = 'bt forte'; bt.id = 'b-agente'; bt.textContent = 'Agente'; bt.title = 'Peça ao Claude para corrigir ou mudar o código, junto com você'; bt.hidden = true;
$('.barra').insertBefore(bt, $('#b-perguntar') || $('#b-encontros'));
ENC.aoEntrar(() => { bt.hidden = false; }); if (ENC.eu()) bt.hidden = false;
bt.onclick = () => { painel.hidden = !painel.hidden; if (!painel.hidden) inicio(); };
$('#ag-fecha').onclick = () => { painel.hidden = true; };

// o que o dev está apontando na cidade: vira contexto do pedido e escolhe o repositório no universo
function foco() { const id = C.api.bairroAberto(), b = C.BAIRRO[id]; return b ? `bairro ${b.nome}${b.estacoes ? ` (etapas: ${b.estacoes.map(e => e.nome).join(', ')})` : ''}` : ''; }
const repoDoFoco = () => { const m = (C.api.bairroAberto() || '').match(/^r(\d+)-/); return m && A.repos[+m[1]] ? A.repos[+m[1]] : A.repos[0]; };

async function inicio() {
  if (!A.repos.length) A.repos = UNI ? (await ENC.api('GET', `/api/universos/${UNI}`)).repos : [{ slug: SLUG }];
  A.lista = (await Promise.all(A.repos.map(r => ENC.api('GET', `/api/cidades/${r.slug}/agentes`).catch(() => [])))).flat().sort((a, b) => b.atualizado - a.atualizado);
  A.aberta = null; const r = repoDoFoco();
  corpo.innerHTML = `<form class="enc-form" id="ag-novo"><label>O que o agente deve fazer?<textarea name="pedido" required placeholder="Ex.: o frete fica errado quando o cliente muda o CEP no checkout. Corrija e adicione um teste."></textarea></label>
      ${A.repos.length > 1 ? `<label>Repositório<select name="repo">${A.repos.map(x => `<option value="${esc(x.slug)}" ${x === r ? 'selected' : ''}>${esc(x.repo)}</option>`).join('')}</select></label>` : ''}
      <p class="ag-foco">Apontando: <b>${esc(foco() || 'a cidade toda')}</b> <small>(clique num bairro para mudar)</small></p>
      <p class="enc-erro" role="alert"></p><button class="bt forte">Começar</button></form>
    <h4 class="ag-tit">Sessões</h4>${A.lista.length ? A.lista.map(s => `<button class="enc-item" data-s="${s.id}"><i class="av" style="--c:${s.estado === 'pr' ? '#5fd38d' : s.estado === 'erro' ? '#ff5d6c' : '#37e6ff'}">${s.estado === 'pr' ? '✓' : s.estado === 'trabalhando' ? '…' : '◆'}</i><span>${esc(s.titulo)}<small>${esc(s.repo)} · ${({ trabalhando: 'trabalhando', esperando: 'esperando você', pr: 'PR aberto', erro: 'erro' })[s.estado] || s.estado}</small></span></button>`).join('') : '<p class="enc-vazio">Nenhuma sessão ainda.</p>'}`;
  for (const s of corpo.querySelectorAll('select')) Object.assign(s.style, { background: 'rgba(4,9,18,.7)', color: 'var(--tinta)', border: '1px solid var(--linha-forte)', borderRadius: '8px', padding: '8px' });
  $$('[data-s]', corpo).forEach(b => b.onclick = () => abrir(+b.dataset.s));
  $('#ag-novo').addEventListener('submit', async (ev) => { ev.preventDefault(); const f = ev.target, b = $('button.forte', f); b.disabled = true;
    try { const s = await ENC.api('POST', '/api/agentes', { cidade: f.repo ? f.repo.value : r.slug, pedido: f.pedido.value, foco: foco() }); abrir(s.id); }
    catch (e) { $('.enc-erro', f).textContent = e.message; b.disabled = false; } });
}
async function abrir(id) { A.aberta = await ENC.api('GET', `/api/agentes/${id}`); desenhar(); }

function desenhar() {
  const s = A.aberta; if (!s || painel.hidden) return; const trab = s.estado === 'trabalhando';
  corpo.innerHTML = `<button class="enc-voltar" id="ag-voltar">← Sessões</button><h4 class="ag-tit">${esc(s.titulo)} <small>${esc(s.repo)}</small></h4>
    <div class="ag-passos" id="ag-passos">${s.passos.map(passoHtml).join('')}${trab ? '<p class="ag-trab"><i></i> o agente está trabalhando…</p>' : ''}</div>
    ${s.alteracoes.length ? `<div class="enc-ativs"><h4>Alterações propostas <small>${s.alteracoes.length} arquivo(s)</small></h4>${s.alteracoes.map((a, k) => `<div class="ag-alt"><button class="bt" data-diff="${k}">${a.apagar ? '🗑' : a.original == null ? '＋' : '✎'} ${esc(a.caminho)}</button>${s.pr_url ? '' : `<button class="bt" data-descartar="${esc(a.caminho)}" title="Descartar">✕</button>`}</div><div class="ag-diff" id="diff-${k}" hidden></div>`).join('')}</div>` : ''}
    ${s.pr_url ? `<a class="bt forte cheio" href="${esc(s.pr_url)}" target="_blank" rel="noopener">Ver o Pull Request no GitHub ↗</a>` : ''}
    ${!s.pr_url && s.alteracoes.length && !trab ? `<form class="enc-form" id="ag-pr"><label>Título do PR<input name="titulo" value="${esc(s.titulo)}" maxlength="120"></label><label>Descrição<textarea name="descricao" placeholder="O que muda e como testar"></textarea></label><p class="enc-erro" role="alert"></p><button class="bt forte">Abrir PR com estas alterações</button></form>` : ''}
    ${s.pr_url ? '' : `<form class="enc-form linha" id="ag-resp" style="margin-top:8px"><input name="texto" maxlength="4000" autocomplete="off" placeholder="${trab ? 'Espere o agente terminar…' : 'Fale com o agente: ajustes, dúvidas, continue…'}" ${trab ? 'disabled' : ''} aria-label="Mensagem para o agente"><button class="bt ${trab ? '' : 'forte'}" ${trab ? 'id="ag-parar" type="button">Parar' : '>Enviar'}</button></form>`}`;
  const passos = $('#ag-passos'); passos.scrollTop = passos.scrollHeight;
  $('#ag-voltar').onclick = inicio;
  $$('[data-diff]', corpo).forEach(b => b.onclick = () => { const k = +b.dataset.diff, el = $(`#diff-${k}`); el.hidden = !el.hidden; if (!el.hidden && !el.innerHTML) el.innerHTML = diff(s.alteracoes[k]); });
  $$('[data-descartar]', corpo).forEach(b => b.onclick = async () => { await ENC.api('POST', `/api/agentes/${s.id}/descartar`, { caminho: b.dataset.descartar }); abrir(s.id); });
  const pr = $('#ag-pr'); if (pr) pr.addEventListener('submit', async (ev) => { ev.preventDefault(); const b = $('button', pr); b.disabled = true; b.textContent = 'Criando branch, commit e PR…';
    try { const r = await ENC.api('POST', `/api/agentes/${s.id}/pr`, { titulo: pr.titulo.value, descricao: pr.descricao.value }); window.open(r.url, '_blank', 'noopener'); abrir(s.id); }
    catch (e) { $('.enc-erro', pr).textContent = e.message; b.disabled = false; b.textContent = 'Abrir PR com estas alterações'; } });
  const resp = $('#ag-resp'); if (resp) resp.addEventListener('submit', async (ev) => { ev.preventDefault(); const t = resp.texto.value.trim(); if (!t) return;
    try { await ENC.api('POST', `/api/agentes/${s.id}/responder`, { texto: t }); s.estado = 'trabalhando'; desenhar(); } catch (e) { alert(e.message); } });
  const parar = $('#ag-parar'); if (parar) parar.onclick = () => ENC.api('POST', `/api/agentes/${s.id}/parar`, {}).catch(() => {});
}
function passoHtml(p) {
  if (p.tipo === 'pedido') return `<div class="enc-msg minha"><small>${esc(p.quem || 'você')}</small>${esc(p.texto)}</div>`;
  if (p.tipo === 'fala') return `<div class="enc-msg"><small>Claude</small>${md(p.texto)}</div>`;
  if (p.tipo === 'ferramenta') return `<p class="ag-ferr">${NOMES[p.nome] || p.nome} <code>${esc(p.alvo || '/')}</code></p>`;
  if (p.tipo === 'alteracao') return `<p class="ag-ferr alt">${p.apagar ? 'propôs apagar' : p.novo ? 'propôs criar' : 'propôs alterar'} <code>${esc(p.caminho)}</code> — ${esc(p.motivo || '')}</p>`;
  if (p.tipo === 'pr') return `<p class="ag-ferr pr">✓ PR #${p.numero} aberto: <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a></p>`;
  if (p.tipo === 'aviso') return `<p class="ag-ferr aviso">${esc(p.texto)}</p>`;
  return '';
}
// diff de linhas (LCS) entre o original e o proposto; arquivo grande demais mostra só o conteúdo novo
function diff(a) {
  const novo = a.apagar ? [] : a.conteudo.split('\n'), velho = a.original == null ? [] : a.original.split('\n');
  if (velho.length * novo.length > 4e6) return `<pre class="ag-pre">${esc(a.conteudo.slice(0, 20000))}</pre>`;
  const n = velho.length, m = novo.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = velho[i] === novo[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const linhas = []; let i = 0, j = 0; while (i < n || j < m) { if (i < n && j < m && velho[i] === novo[j]) { linhas.push([' ', velho[i]]); i++; j++; } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { linhas.push(['+', novo[j]]); j++; } else { linhas.push(['-', velho[i]]); i++; } }
  // só os trechos mudados, com 3 linhas de contexto
  const mostrar = new Set(); linhas.forEach((l, k) => { if (l[0] !== ' ') for (let d = -3; d <= 3; d++) mostrar.add(k + d); });
  let html = '', antes = -2; linhas.forEach((l, k) => { if (!mostrar.has(k)) return; if (k !== antes + 1) html += '<span class="d-sep">⋯</span>'; antes = k; html += `<span class="d-${l[0] === '+' ? 'mais' : l[0] === '-' ? 'menos' : 'igual'}">${l[0]} ${esc(l[1])}</span>`; });
  return `<pre class="ag-pre">${html || 'Sem diferenças.'}</pre><p class="rp-nota">${esc(a.motivo)}</p>`;
}
ENC.ouvir((m) => { if (m.t !== 'agente:passo') return; const s = A.aberta;
  if (s && s.id === m.sessao) { if (m.passo.tipo === 'estado') return abrir(s.id); if (m.passo.tipo === 'alteracao') return abrir(s.id); s.passos.push(m.passo); s.estado = m.estado; desenhar(); } });
C.agente = { abrir: () => { painel.hidden = false; inicio(); }, sessao: (id) => { painel.hidden = false; abrir(id); } };
})();
