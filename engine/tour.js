// SystemCity — tour e modo apresentação. Um roteiro de paradas (visão geral, cada bairro, os sistemas de fora, o fim):
// a câmera voa até cada parada, uma legenda conta o que é e, se quiser, uma voz lê em voz alta.
//   Tour de onboarding: no fim, um quiz de 3 perguntas tiradas da própria cidade.
//   Apresentação: tela limpa (sem barra nem rótulos), avanço automático; o link ?apresentar=1 já abre tocando.
// O texto padrão sai da descrição dos bairros; "Roteiro pelo Claude" pede uma narração melhor ao servidor.
(() => {
'use strict';
const C = window.CID; if (!C || !C.api) return;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T = { paradas: [], i: -1, tocando: false, voz: false, modo: null, relogio: null, quiz: null };

function roteiroPadrao() {
  const titulo = document.title, ext = C.PREDIOS.filter(p => p.ext);
  return [
    { tipo: 'cidade', titulo, texto: `Esta é a cidade de ${titulo}. Cada bairro é um módulo do sistema, cada prédio é uma etapa do fluxo e cada pessoinha andando é um item passando por ele. Vamos dar uma volta.` },
    ...C.BAIRROS.map(b => ({ tipo: 'b', id: b.id, titulo: b.nome, texto: `${b.desc || b.sub || ''} ${b.estacoes ? `O caminho aqui é: ${b.estacoes.map(e => e.nome).join(', ')}.` : ''} ${(b.desvios || []).length ? `Quando algo dá errado, o item cai em ${b.desvios.map(d => d.nome.toLowerCase()).join(' ou ')}.` : ''}`.replace(/\s+/g, ' ').trim() })),
    ...(ext.length ? [{ tipo: 'cidade', titulo: 'O mundo de fora', texto: `A cidade conversa com ${ext.length} sistema${ext.length > 1 ? 's' : ''} de fora: ${ext.map(e => e.nome).join(', ')}. As ruas até eles mostram quem chama quem.` }] : []),
    { tipo: 'cidade', titulo: 'Pronto', texto: 'É isso. Clique em qualquer prédio para ver os detalhes, abra a torre de documentos de cada bairro ou pergunte qualquer coisa no painel Perguntar.' },
  ];
}

// ---------- interface ----------
document.getElementById('app').insertAdjacentHTML('beforeend', `
  <section class="tour vidro" id="tour" aria-live="polite" hidden>
    <div class="tour-cab"><small id="tour-n"></small><b id="tour-tit"></b></div><p id="tour-txt"></p>
    <div class="tour-barra"><i id="tour-prog"></i></div>
    <div class="tour-ctl"><button class="bt" id="tour-ant" aria-label="Anterior">←</button><button class="bt forte" id="tour-play">Pausar</button><button class="bt" id="tour-prox" aria-label="Próxima">→</button>
      <button class="bt" id="tour-voz" aria-pressed="false">Voz</button><button class="bt" id="tour-claude">Roteiro pelo Claude</button><button class="bt" id="tour-link">Copiar link</button><button class="bt" id="tour-sair">Sair</button></div>
  </section>`);
const caixa = $('#tour'), barra = $('.barra'), btTour = document.createElement('button'), btApres = document.createElement('button');
btTour.className = 'bt'; btTour.id = 'b-tour'; btTour.textContent = 'Tour'; btTour.title = 'Um passeio guiado pela cidade, com quiz no fim';
btApres.className = 'bt'; btApres.id = 'b-apresentar'; btApres.textContent = 'Apresentar'; btApres.title = 'Modo apresentação: tela limpa e roteiro automático';
barra.insertBefore(btApres, $('#b-encontros')); barra.insertBefore(btTour, btApres);
btTour.onclick = () => comecar('tour'); btApres.onclick = () => comecar('apresentar');

function comecar(modo, paradas) {
  T.modo = modo; T.paradas = paradas || T.roteiroClaude || roteiroPadrao(); T.i = -1; T.tocando = true; caixa.hidden = false; T.quiz = null;
  document.body.classList.toggle('apresentando', modo === 'apresentar'); if (modo === 'apresentar' && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  const f = $('#ficha'); if (f) f.hidden = true; ir(0);
}
function sair() { clearTimeout(T.relogio); T.tocando = false; caixa.hidden = true; speechSynthesis && speechSynthesis.cancel(); document.body.classList.remove('apresentando'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
function ir(i) {
  clearTimeout(T.relogio); if (i >= T.paradas.length) return T.modo === 'tour' ? quiz() : sair(); T.i = Math.max(0, i);
  const p = T.paradas[T.i]; $('#tour-n').textContent = `${T.i + 1} de ${T.paradas.length}`; $('#tour-tit').textContent = p.titulo; $('#tour-txt').textContent = p.texto;
  if (p.tipo === 'b' && C.BAIRRO[p.id]) C.api.escolher('b', p.id); else if (p.tipo === 'p' && C.PREDIO[p.id]) C.api.escolher('p', p.id); else C.api.voarCidade();
  const f = $('#ficha'); if (f && T.modo === 'apresentar') f.hidden = true;
  const dur = Math.max(6000, p.texto.length * 62); const prog = $('#tour-prog'); prog.style.transition = 'none'; prog.style.width = '0'; void prog.offsetWidth;
  if (T.voz && window.speechSynthesis) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(p.texto); u.lang = 'pt-BR'; u.rate = 1.02; u.onend = () => { if (T.tocando && T.paradas[T.i] === p) T.relogio = setTimeout(() => ir(T.i + 1), 900); }; speechSynthesis.speak(u); }
  else if (T.tocando) { prog.style.transition = `width ${dur}ms linear`; prog.style.width = '100%'; T.relogio = setTimeout(() => ir(T.i + 1), dur); }
  $('#tour-play').textContent = T.tocando ? 'Pausar' : 'Continuar';
}
$('#tour-ant').onclick = () => ir(T.i - 1); $('#tour-prox').onclick = () => ir(T.i + 1); $('#tour-sair').onclick = sair;
$('#tour-play').onclick = () => { T.tocando = !T.tocando; if (!T.tocando) { clearTimeout(T.relogio); speechSynthesis && speechSynthesis.cancel(); $('#tour-prog').style.transition = 'none'; } ir(T.i); };
$('#tour-voz').onclick = (e) => { T.voz = !T.voz; e.currentTarget.setAttribute('aria-pressed', String(T.voz)); if (!T.voz) speechSynthesis && speechSynthesis.cancel(); ir(T.i); };
$('#tour-link').onclick = async () => { const u = new URL(location.href); u.hash = ''; u.searchParams.set(T.modo === 'apresentar' ? 'apresentar' : 'tour', '1'); await navigator.clipboard.writeText(u.toString()).catch(() => {}); $('#tour-link').textContent = 'Link copiado'; setTimeout(() => { $('#tour-link').textContent = 'Copiar link'; }, 1800); };
$('#tour-claude').onclick = async () => { const b = $('#tour-claude'); if (!C.encontros || !C.encontros.eu()) return alert('Entre na sua conta para pedir o roteiro ao Claude.');
  b.disabled = true; b.textContent = 'O Claude está escrevendo…'; clearTimeout(T.relogio);
  try { const r = await C.encontros.api('POST', '/api/cidade/roteiro', { slug: window.SYSTEMCITY_SLUG || null, modo: T.modo, mapa: { titulo: document.title, bairros: C.BAIRROS.map(x => ({ id: x.id, nome: x.nome, sub: x.sub, desc: x.desc, estacoes: (x.estacoes || []).map(e => ({ id: e.id, nome: e.nome, desc: e.desc })), desvios: (x.desvios || []).map(d => d.nome) })), externos: C.PREDIOS.filter(p => p.ext).map(p => ({ id: p.id, nome: p.nome, desc: p.desc })) } });
    T.roteiroClaude = r.paradas.filter(p => p.tipo === 'cidade' || (p.tipo === 'b' && C.BAIRRO[p.id]) || (p.tipo === 'p' && C.PREDIO[p.id])); comecar(T.modo, T.roteiroClaude); b.textContent = 'Roteiro do Claude ✓'; }
  catch (e) { alert(e.message); b.textContent = 'Roteiro pelo Claude'; } finally { b.disabled = false; } };

// ---------- quiz do onboarding: 3 perguntas tiradas da cidade, com alternativas embaralhadas ----------
function quiz() {
  clearTimeout(T.relogio); const bairros = C.BAIRROS.filter(b => b.estacoes && b.estacoes.length), perguntas = [];
  const mistura = (l) => l.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  for (const b of mistura(bairros).slice(0, 3)) { const e = b.estacoes[Math.floor(Math.random() * b.estacoes.length)], outros = mistura(bairros.filter(x => x !== b)).slice(0, 3);
    perguntas.push({ q: `Em que bairro fica “${e.nome}”?`, certa: b.nome, opcoes: mistura([b.nome, ...outros.map(x => x.nome)]) }); }
  const ext = C.PREDIOS.filter(p => p.ext); if (ext.length && perguntas.length < 3) perguntas.push({ q: 'Qual destes é um sistema de fora?', certa: ext[0].nome, opcoes: mistura([ext[0].nome, ...mistura(C.PREDIOS.filter(p => p.tipo === 'estacao')).slice(0, 3).map(p => p.nome)]) });
  T.quiz = { perguntas, i: 0, acertos: 0 }; mostrarPergunta();
}
function mostrarPergunta() {
  const z = T.quiz, p = z.perguntas[z.i]; $('#tour-n').textContent = `Quiz · ${z.i + 1} de ${z.perguntas.length}`;
  if (!p) { $('#tour-tit').textContent = z.acertos === z.perguntas.length ? 'Gabaritou! 🎉' : `${z.acertos} de ${z.perguntas.length}`;
    $('#tour-txt').innerHTML = z.acertos === z.perguntas.length ? 'Você já conhece a cidade. Bem-vindo ao time.' : 'Quase lá. Refaça o tour quando quiser, ou pergunte no painel Perguntar.'; if (z.acertos === z.perguntas.length && C.theGrid) C.theGrid.confete(); return; }
  $('#tour-tit').textContent = p.q; $('#tour-txt').innerHTML = `<span class="tour-opcoes">${p.opcoes.map(o => `<button class="bt" data-op="${esc(o)}">${esc(o)}</button>`).join('')}</span>`;
  caixa.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { const ok = b.dataset.op === p.certa; if (ok) z.acertos++; b.classList.add(ok ? 'certa' : 'errada');
    if (!ok) caixa.querySelector(`[data-op="${CSS.escape(p.certa)}"]`).classList.add('certa'); caixa.querySelectorAll('[data-op]').forEach(x => { x.disabled = true; }); setTimeout(() => { z.i++; mostrarPergunta(); }, 1300); });
}
// abrir pelo link
const qs = new URLSearchParams(location.search); if (qs.get('tour') || qs.get('apresentar')) setTimeout(() => comecar(qs.get('apresentar') ? 'apresentar' : 'tour'), 2500);
C.tour = { comecar, sair };
})();
