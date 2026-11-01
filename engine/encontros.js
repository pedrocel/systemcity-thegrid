// SystemCity — encontros: pessoas, conversas, agenda de reuniões e chamadas de voz e vídeo, dentro da cidade.
// Só liga quando a cidade é servida pelo servidor/ (que tem a API em /api e o tempo real em /ws). Numa hospedagem estática, some.
// As chamadas são WebRTC em malha: cada par de pessoas tem a própria conexão; o servidor só repassa os sinais.
(() => {
'use strict';
const C = window.CID; if (!C) return;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CIDADE = (window.SYSTEMCITY_BASE || '').split('/').filter(Boolean).pop() || 'exemplo';
const ICE = window.SYSTEMCITY_ICE || [{ urls: 'stun:stun.l.google.com:19302' }];   // para redes corporativas, configure um TURN aqui
const CORES = [0x3fa9f5, 0x5fd38d, 0xf4c542, 0xf472b6, 0xa78bfa, 0xff9d3c, 0x4fd1c5, 0xff5d6c];
const corDe = (id) => CORES[id % CORES.length], hexDe = (n) => '#' + n.toString(16).padStart(6, '0');
const iniciais = (nome) => (nome || '?').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dia = (t) => new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

const E = { transcricao: new Map(), legendas: [], vista: null, eu: null, pessoas: [], salas: [], reunioes: [], online: new Map(), aba: 'pessoas', aberta: null, msgs: {}, chamadas: new Map(), ws: null, digitando: {} };
const pessoa = (id) => E.pessoas.find(p => p.id === id) || { id, nome: (E.online.get(id) || {}).nome || 'Alguém' };
const nomeSala = (s) => (s.tipo === 'direta' ? pessoa(s.membros.find(m => m !== E.eu.id) ?? E.eu.id).nome : s.nome);

async function api(metodo, caminho, corpo) {
  const r = await fetch(caminho, { method: metodo, credentials: 'same-origin', headers: corpo ? { 'content-type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text(), dado = txt ? JSON.parse(txt) : null;
  if (!r.ok) { const e = new Error((dado && dado.erro) || `Erro ${r.status}`); e.status = r.status; throw e; }
  return dado;
}

// ---------- interface ----------
const barra = $('.barra'), botao = document.createElement('button');
botao.className = 'bt'; botao.id = 'b-encontros'; botao.setAttribute('aria-pressed', 'false'); botao.setAttribute('aria-controls', 'encontros'); botao.hidden = true;
botao.innerHTML = 'Encontros<span class="cont" id="enc-cont"></span>'; barra.insertBefore(botao, barra.querySelector('#b-pausa'));
document.getElementById('app').insertAdjacentHTML('beforeend', `
  <aside class="enc vidro" id="encontros" aria-label="Encontros: pessoas, conversas e agenda" hidden>
    <div class="enc-cab"><b>Encontros</b><small id="enc-eu"></small><button class="bt" id="enc-sair">Sair</button><button class="bt" id="enc-fecha" aria-label="Fechar">✕</button></div>
    <div class="enc-abas seg" role="tablist"><button class="bt" role="tab" data-aba="pessoas">Pessoas</button><button class="bt" role="tab" data-aba="conversas">Conversas<span class="cont" id="enc-cont-c"></span></button><button class="bt" role="tab" data-aba="agenda">Agenda</button></div>
    <div class="enc-corpo" id="enc-corpo"></div>
  </aside>
  <div class="enc-entrada" id="enc-entrada" hidden><form class="vidro" id="enc-form-entrada" novalidate>
    <h2 id="enc-e-tit">Entrar nos encontros</h2><p>Converse, ligue e marque reuniões com quem está na cidade.</p>
    <label id="enc-e-nome-l" hidden>Nome<input id="enc-e-nome" autocomplete="name" maxlength="60"></label>
    <label>E-mail<input id="enc-e-email" type="email" autocomplete="email" required></label>
    <label>Senha<input id="enc-e-senha" type="password" autocomplete="current-password" minlength="8" required></label>
    <p class="enc-erro" id="enc-e-erro" role="alert"></p>
    <button class="bt forte" id="enc-e-ir">Entrar</button><button type="button" class="troca" id="enc-e-troca">Não tem conta? Criar conta</button><button type="button" class="troca" id="enc-e-fecha">Agora não</button>
  </form></div>
  <div class="enc-toque vidro" id="enc-toque" role="alert" hidden></div>
  <section class="enc-chamada" id="enc-chamada" aria-label="Chamada" hidden>
    <header><span id="enc-ch-tit"></span><small id="enc-ch-sub"></small></header>
    <div class="enc-videos" id="enc-videos"></div>
    <div class="enc-legenda" id="enc-legenda" aria-live="polite" hidden></div>
    <div class="enc-controles"><button class="bt" id="enc-mic" aria-pressed="true">Microfone</button><button class="bt" id="enc-cam" aria-pressed="true">Câmera</button><button class="bt" id="enc-tela" aria-pressed="false">Compartilhar tela</button><button class="bt" id="enc-transcrever" aria-pressed="false" title="Transcreve a chamada para o Claude gerar as atividades no fim">Transcrever</button><label class="enc-motor" title="Quem reconhece a sua voz" hidden><span class="so-leitor">Reconhecimento de voz</span><select id="enc-motor"><option value="navegador">Voz: navegador</option><option value="whisper">Voz: Whisper local</option></select></label><button class="bt rubi" id="enc-desligar">Sair da chamada</button></div>
  </section>`);
const painel = $('#encontros'), corpo = $('#enc-corpo'), entrada = $('#enc-entrada');

function abrirPainel(sim) { painel.hidden = !sim; botao.setAttribute('aria-pressed', String(sim)); if (sim) desenhar(); }
botao.addEventListener('click', () => { if (!E.eu) { entrada.hidden = false; $('#enc-e-email').focus(); return; } abrirPainel(painel.hidden); });
$('#enc-fecha').addEventListener('click', () => abrirPainel(false));
$$('.enc-abas [data-aba]').forEach(b => b.addEventListener('click', () => { E.aba = b.dataset.aba; E.aberta = null; E.vista = null; desenhar(); }));
$('#enc-sair').addEventListener('click', async () => { await api('POST', '/api/sair', {}).catch(() => {}); location.reload(); });

// entrada e cadastro
let criando = false;
$('#enc-e-troca').addEventListener('click', () => { criando = !criando; $('#enc-e-nome-l').hidden = !criando; $('#enc-e-tit').textContent = criando ? 'Criar conta' : 'Entrar nos encontros';
  $('#enc-e-ir').textContent = criando ? 'Criar conta' : 'Entrar'; $('#enc-e-troca').textContent = criando ? 'Já tem conta? Entrar' : 'Não tem conta? Criar conta'; $('#enc-e-senha').autocomplete = criando ? 'new-password' : 'current-password'; });
$('#enc-e-fecha').addEventListener('click', () => { entrada.hidden = true; });
$('#enc-form-entrada').addEventListener('submit', async (ev) => { ev.preventDefault(); const erro = $('#enc-e-erro'); erro.textContent = '';
  try { E.eu = await api('POST', criando ? '/api/cadastro' : '/api/entrar', { email: $('#enc-e-email').value, senha: $('#enc-e-senha').value, nome: $('#enc-e-nome').value });
    entrada.hidden = true; $('#enc-e-senha').value = ''; await iniciar(); abrirPainel(true); }
  catch (e) { erro.textContent = e.message; } });

function desenhar() {
  if (painel.hidden || !E.eu) return;
  $('#enc-eu').textContent = E.eu.nome; $$('.enc-abas [data-aba]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.aba === E.aba)));
  if (E.vista) return E.vista.tipo === 'ata' ? desenharAta() : desenharAtas();
  if (E.aberta) return desenharConversa();
  if (E.aba === 'pessoas') desenharPessoas(); else if (E.aba === 'conversas') desenharSalas(); else desenharAgenda();
}
const avatar = (id, nome) => `<i class="av" style="--c:${hexDe(corDe(id))}" data-on="${E.online.has(id) ? 1 : 0}">${esc(iniciais(nome))}</i>`;

function desenharPessoas() {
  const outros = E.pessoas.filter(p => p.id !== E.eu.id).sort((a, b) => E.online.has(b.id) - E.online.has(a.id) || a.nome.localeCompare(b.nome));
  corpo.innerHTML = outros.length ? outros.map(p => { const o = E.online.get(p.id), onde = o && o.x != null ? (o.cidade === CIDADE ? 'andando nesta cidade' : 'em outra cidade') : o ? 'online' : 'offline';
    return `<div class="enc-item">${avatar(p.id, p.nome)}<span>${esc(p.nome)}<small>${onde}</small></span><span class="enc-acoes"><button class="bt" data-msg="${p.id}">Mensagem</button><button class="bt" data-ligar="${p.id}" ${o ? '' : 'disabled'}>Ligar</button></span></div>`; }).join('')
    : '<p class="enc-vazio">Ninguém mais tem conta ainda. Mande o endereço da cidade para alguém criar a dele.</p>';
  $$('[data-msg]', corpo).forEach(b => b.addEventListener('click', async () => abrirSala(await direta(+b.dataset.msg))));
  $$('[data-ligar]', corpo).forEach(b => b.addEventListener('click', async () => entrarNaChamada((await direta(+b.dataset.ligar)).id)));
}
async function direta(com) { const s = await api('POST', '/api/diretas', { com }); guardarSala(s); return s; }
function guardarSala(s) { const i = E.salas.findIndex(x => x.id === s.id); if (i >= 0) E.salas[i] = s; else E.salas.unshift(s); contarNovas(); }

function desenharSalas() {
  corpo.innerHTML = `<button class="bt cheio" id="enc-novo-grupo">Novo grupo</button>` + (E.salas.length ? E.salas.map(s => { const tocando = (E.chamadas.get(s.id) || []).length;
    return `<button class="enc-item" data-sala="${s.id}">${s.tipo === 'direta' ? avatar(s.membros.find(m => m !== E.eu.id) ?? E.eu.id, nomeSala(s)) : `<i class="av" style="--c:${hexDe(corDe(s.id + 3))}">${s.tipo === 'reuniao' ? '◷' : '#'}</i>`}
      <span>${esc(nomeSala(s))}<small>${tocando ? `● chamada com ${tocando} pessoa${tocando > 1 ? 's' : ''}` : s.ultima ? esc((s.ultima.autor === E.eu.id ? 'Você: ' : '') + s.ultima.texto) : s.tipo === 'reuniao' ? 'sala da reunião' : 'sem mensagens'}</small></span>${s.novas ? `<em>${s.novas}</em>` : ''}</button>`; }).join('')
    : '<p class="enc-vazio">Nenhuma conversa ainda. Comece pela aba Pessoas.</p>');
  $$('[data-sala]', corpo).forEach(b => b.addEventListener('click', () => abrirSala(E.salas.find(s => s.id === +b.dataset.sala))));
  $('#enc-novo-grupo').addEventListener('click', formGrupo);
}
const escolherPessoas = () => `<div class="enc-escolha">${E.pessoas.filter(p => p.id !== E.eu.id).map(p => `<label class="marcar"><input type="checkbox" value="${p.id}">${esc(p.nome)}</label>`).join('') || '<small>Ninguém mais tem conta ainda.</small>'}</div>`;
function formGrupo() {
  corpo.innerHTML = `<button class="enc-voltar" data-voltar>← Conversas</button><form class="enc-form" id="enc-f-grupo"><label>Nome do grupo<input name="nome" maxlength="80" required></label><label>Quem entra${escolherPessoas()}</label><p class="enc-erro" role="alert"></p><button class="bt forte">Criar grupo</button></form>`;
  $('[data-voltar]', corpo).addEventListener('click', desenhar);
  $('#enc-f-grupo').addEventListener('submit', async (ev) => { ev.preventDefault(); const f = ev.target;
    try { const s = await api('POST', '/api/salas', { nome: f.nome.value, membros: $$('input[type=checkbox]:checked', f).map(i => +i.value) }); guardarSala(s); abrirSala(s); }
    catch (e) { $('.enc-erro', f).textContent = e.message; } });
}

async function abrirSala(s) { if (!s) return; E.aba = 'conversas'; E.aberta = s.id; if (painel.hidden) abrirPainel(true);
  if (!E.msgs[s.id]) E.msgs[s.id] = await api('GET', `/api/salas/${s.id}/mensagens`); desenhar(); }
function desenharConversa() {
  const s = E.salas.find(x => x.id === E.aberta); if (!s) { E.aberta = null; return desenhar(); }
  const msgs = E.msgs[s.id] || [], ult = msgs[msgs.length - 1];
  corpo.innerHTML = `<div class="enc-conversa"><button class="enc-voltar" data-voltar>← Conversas</button>
    <div class="enc-cab" style="padding:0 0 8px"><b>${esc(nomeSala(s))}</b><button class="bt" id="enc-atas">Atas</button><button class="bt" id="enc-ligar-sala">${(E.chamadas.get(s.id) || []).length ? 'Entrar na chamada' : 'Ligar'}</button></div>
    <div class="enc-msgs" id="enc-msgs" aria-live="polite">${msgs.length ? msgs.map(m => `<div class="enc-msg ${m.autor === E.eu.id ? 'minha' : ''}"><small>${m.autor === E.eu.id ? 'Você' : esc(pessoa(m.autor).nome)} · ${hora(m.criada)}</small>${esc(m.texto)}</div>`).join('') : '<p class="enc-vazio">Diga oi.</p>'}</div>
    <div class="enc-digitando" id="enc-digitando"></div>
    <form class="enc-form linha" id="enc-f-msg"><input name="texto" maxlength="4000" autocomplete="off" placeholder="Mensagem" aria-label="Mensagem"><button class="bt forte">Enviar</button></form></div>`;
  const lista = $('#enc-msgs'); lista.scrollTop = lista.scrollHeight;
  $('[data-voltar]', corpo).addEventListener('click', () => { E.aberta = null; desenhar(); });
  $('#enc-ligar-sala').addEventListener('click', () => entrarNaChamada(s.id));
  $('#enc-atas').addEventListener('click', () => abrirAtas(s.id));
  const f = $('#enc-f-msg'), campo = f.texto; let ultimoAviso = 0;
  campo.addEventListener('input', () => { if (Date.now() - ultimoAviso > 2500) { ultimoAviso = Date.now(); enviarWs({ t: 'digitando', sala: s.id }); } });
  f.addEventListener('submit', async (ev) => { ev.preventDefault(); const texto = campo.value.trim(); if (!texto) return; campo.value = '';
    try { await api('POST', `/api/salas/${s.id}/mensagens`, { texto }); } catch (e) { campo.value = texto; alert(e.message); } campo.focus(); });
  campo.focus();
  if (ult && s.novas) { s.novas = 0; contarNovas(); api('POST', `/api/salas/${s.id}/lida`, { ate: ult.id }).catch(() => {}); }
}

function desenharAgenda() {
  const agora = Date.now();
  corpo.innerHTML = `<button class="bt cheio" id="enc-nova-reuniao">Marcar reunião</button>` + (E.reunioes.length ? E.reunioes.map(r => { const ja = agora >= r.inicio - 10 * 60e3 && agora <= r.fim;
    const sims = r.convidados.filter(c => c.resposta === 'sim').length;
    return `<div class="enc-reuniao"><h4>${esc(r.titulo)}</h4><p>${dia(r.inicio)} · ${hora(r.inicio)}–${hora(r.fim)}${ja ? ' · <span class="agora">agora</span>' : ''} · ${sims}/${r.convidados.length} confirmados${r.descricao ? `<br>${esc(r.descricao)}` : ''}</p>
      <div class="enc-acoes">${ja ? `<button class="bt forte" data-entrar="${r.sala}">Entrar</button>` : ''}${['sim', 'talvez', 'nao'].map(x => `<button class="bt" data-resp="${x}" data-r="${r.id}" aria-pressed="${r.minha_resposta === x}">${{ sim: 'Vou', talvez: 'Talvez', nao: 'Não vou' }[x]}</button>`).join('')}<button class="bt" data-chat="${r.sala}">Conversa</button></div></div>`; }).join('')
    : '<p class="enc-vazio">Nenhuma reunião marcada.</p>');
  $('#enc-nova-reuniao').addEventListener('click', formReuniao);
  $$('[data-entrar]', corpo).forEach(b => b.addEventListener('click', () => entrarNaChamada(+b.dataset.entrar)));
  $$('[data-chat]', corpo).forEach(b => b.addEventListener('click', () => abrirSala(E.salas.find(s => s.id === +b.dataset.chat))));
  $$('[data-resp]', corpo).forEach(b => b.addEventListener('click', () => api('POST', `/api/reunioes/${b.dataset.r}/resposta`, { resposta: b.dataset.resp }).catch(e => alert(e.message))));
}
function formReuniao() {
  const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); const local = new Date(d - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  corpo.innerHTML = `<button class="enc-voltar" data-voltar>← Agenda</button><form class="enc-form" id="enc-f-reuniao">
    <label>Título<input name="titulo" maxlength="120" required></label><label>Quando<input name="inicio" type="datetime-local" value="${local}" required></label>
    <label>Duração (minutos)<input name="duracao" type="number" min="5" max="600" step="5" value="30" required></label>
    <label>Pauta<textarea name="descricao" maxlength="2000"></textarea></label><label>Convidados${escolherPessoas()}</label>
    <p class="enc-erro" role="alert"></p><button class="bt forte">Marcar</button></form>`;
  $('[data-voltar]', corpo).addEventListener('click', desenhar);
  $('#enc-f-reuniao').addEventListener('submit', async (ev) => { ev.preventDefault(); const f = ev.target, inicio = new Date(f.inicio.value).getTime();
    try { await api('POST', '/api/reunioes', { titulo: f.titulo.value, descricao: f.descricao.value, inicio, fim: inicio + f.duracao.value * 60e3, convidados: $$('input[type=checkbox]:checked', f).map(i => +i.value) }); E.aba = 'agenda'; desenhar(); }
    catch (e) { $('.enc-erro', f).textContent = e.message; } });
}
function contarNovas() { const n = E.salas.reduce((a, s) => a + (s.novas || 0), 0); $('#enc-cont').textContent = n || ''; $('#enc-cont-c').textContent = n || ''; }

// ---------- tempo real ----------
const ouvintes = [];
const enviarWs = (m) => { if (E.ws && E.ws.readyState === 1) E.ws.send(JSON.stringify(m)); };
function conectar() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); E.ws = ws;
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    for (const fn of ouvintes) fn(m);   // outros módulos (The Grid) ouvem o mesmo tempo real
    if (m.t === 'presenca') { E.online = new Map(m.pessoas.map(p => [p.id, p])); if (m.pessoas.some(p => !E.pessoas.find(x => x.id === p.id))) api('GET', '/api/pessoas').then(l => { E.pessoas = l; desenhar(); }); else if (E.aba === 'pessoas' && !E.aberta) desenhar(); }
    else if (m.t === 'mensagem') { const s = E.salas.find(x => x.id === m.mensagem.sala); if (E.msgs[m.mensagem.sala]) E.msgs[m.mensagem.sala].push(m.mensagem);
      if (!s) return api('GET', '/api/salas').then(l => { E.salas = l; contarNovas(); desenhar(); });
      s.ultima = m.mensagem; E.salas = [s, ...E.salas.filter(x => x !== s)];
      const vendo = E.aberta === s.id && !painel.hidden; if (m.mensagem.autor !== E.eu.id && !vendo) s.novas = (s.novas || 0) + 1;
      if (vendo && m.mensagem.autor !== E.eu.id) api('POST', `/api/salas/${s.id}/lida`, { ate: m.mensagem.id }).catch(() => {});
      contarNovas(); desenhar(); }
    else if (m.t === 'sala') { guardarSala(m.sala); desenhar(); }
    else if (m.t === 'reuniao') { const i = E.reunioes.findIndex(r => r.id === m.reuniao.id); if (i >= 0) E.reunioes[i] = m.reuniao; else E.reunioes.push(m.reuniao); E.reunioes.sort((a, b) => a.inicio - b.inicio);
      if (!E.salas.find(s => s.id === m.reuniao.sala)) api('GET', '/api/salas').then(l => { E.salas = l; }); desenhar(); }
    else if (m.t === 'digitando') { if (E.aberta === m.sala) { const el = $('#enc-digitando'); if (el) { el.textContent = `${pessoa(m.usuario).nome} está digitando…`; clearTimeout(E.digitando[m.sala]); E.digitando[m.sala] = setTimeout(() => { el.textContent = ''; }, 3000); } } }
    else if (m.t === 'chamada') { E.chamadas.set(m.sala, m.participantes); aoMudarChamada(m.sala); }
    else if (m.t === 'sinal') aoSinal(m);
    else if (m.t === 'transcricao') { E.transcricao.set(m.sala, m.ligada); if (m.sala === ch.sala) { if (m.ligada) E.transcreveu = m.sala; ajustarTranscricao(); legenda(m.ligada ? `${m.por === E.eu.id ? 'Você ligou' : pessoa(m.por).nome + ' ligou'} a transcrição. Tudo o que for dito vira texto para a ata.` : 'Transcrição desligada.', true); } }
    else if (m.t === 'fala') { if (m.fala.sala === ch.sala) legenda(`${m.fala.autor === E.eu.id ? 'Você' : pessoa(m.fala.autor).nome}: ${m.fala.texto}`); }
    else if (m.t === 'ata:gerando') { E.gerando = m.gerando ? m.sala : null; if (E.vista && E.vista.sala === m.sala) desenhar(); }
    else if (m.t === 'ata') { if (E.vista && E.vista.sala === m.ata.sala && E.vista.tipo === 'atas') desenhar(); else avisar(`Ata pronta: ${m.ata.titulo}`, () => abrirAta(m.ata.id, m.ata.sala)); }
  };
  ws.onclose = () => { E.ws = null; if (ch.sala) sairDaChamada(true); setTimeout(() => { if (E.eu) conectar(); }, 2500); };   // cai e volta sozinho
}

// ---------- chamadas (WebRTC em malha) ----------
const ch = { sala: null, local: null, tela: null, pares: new Map() };   // pares: usuario -> { pc, video }
async function entrarNaChamada(sala, { compacta = false } = {}) {   // compacta: janelinha no canto, para chamar sem sair do jogo
  $('#enc-chamada').classList.toggle('compacta', compacta);
  if (ch.sala === sala) return; if (ch.sala) sairDaChamada();
  try { ch.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 400 } }); }
  catch { try { ch.local = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { alert('Não deu para abrir o microfone: ' + e.message); return; } }
  ch.sala = sala; esconderToque(); const s = E.salas.find(x => x.id === sala);
  $('#enc-ch-tit').textContent = s ? nomeSala(s) : 'Chamada'; $('#enc-chamada').hidden = false;
  $('#enc-cam').setAttribute('aria-pressed', String(!!ch.local.getVideoTracks().length)); $('#enc-mic').setAttribute('aria-pressed', 'true');
  quadroVideo(E.eu.id, ch.local, true); enviarWs({ t: 'chamada:entrar', sala }); atualizarSub();
}
function sairDaChamada(semAviso) {
  if (!ch.sala) return; if (!semAviso) enviarWs({ t: 'chamada:sair', sala: ch.sala });
  for (const [u] of ch.pares) fecharPar(u);
  for (const s of [ch.local, ch.tela]) if (s) s.getTracks().forEach(t => t.stop());
  const saiu = ch.sala; ch.sala = null; ajustarTranscricao(); $('#enc-legenda').hidden = true; E.legendas = [];
  if (!semAviso && E.transcreveu === saiu) { E.transcreveu = null; abrirAtas(saiu); }
  ch.local = null; ch.tela = null; $('#enc-videos').innerHTML = ''; $('#enc-chamada').hidden = true; $('#enc-tela').setAttribute('aria-pressed', 'false');
}
function aoMudarChamada(sala) {
  const quem = E.chamadas.get(sala) || [];
  if (sala === ch.sala) {
    for (const [u] of ch.pares) if (!quem.includes(u)) fecharPar(u);
    for (const u of quem) if (u !== E.eu.id && !ch.pares.has(u) && E.eu.id < u) ofertar(u);   // quem tem o id menor oferta: os dois lados nunca ofertam juntos
    atualizarSub();
  } else if (quem.length && !quem.includes(E.eu.id) && !ch.sala) tocar(sala, quem);
  else if (!quem.length) esconderToque(sala);
  if (!painel.hidden && E.aba === 'conversas') desenhar();
}
function par(u) {
  if (ch.pares.has(u)) return ch.pares.get(u).pc;
  const pc = new RTCPeerConnection({ iceServers: ICE }), p = { pc, video: null };
  ch.pares.set(u, p);
  for (const t of (ch.tela ? [...ch.local.getAudioTracks(), ...ch.tela.getVideoTracks()] : ch.local.getTracks())) pc.addTrack(t, ch.local);
  pc.onicecandidate = (e) => { if (e.candidate) enviarWs({ t: 'sinal', sala: ch.sala, para: u, dados: { ice: e.candidate } }); };
  pc.ontrack = (e) => { p.video = quadroVideo(u, e.streams[0], false); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce(); };
  return pc;
}
async function ofertar(u) { const pc = par(u); await pc.setLocalDescription(await pc.createOffer()); enviarWs({ t: 'sinal', sala: ch.sala, para: u, dados: { sdp: pc.localDescription } }); }
async function aoSinal({ de, sala, dados }) {
  if (sala !== ch.sala || !dados) return; const pc = par(de);
  try {
    if (dados.sdp) { await pc.setRemoteDescription(dados.sdp);
      if (dados.sdp.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); enviarWs({ t: 'sinal', sala, para: de, dados: { sdp: pc.localDescription } }); } }
    else if (dados.ice) await pc.addIceCandidate(dados.ice);
  } catch (e) { console.warn('SystemCity: sinal da chamada falhou', e); }
}
function fecharPar(u) { const p = ch.pares.get(u); if (!p) return; p.pc.close(); ch.pares.delete(u); const el = $(`#enc-videos [data-u="${u}"]`); if (el) el.remove(); }
function quadroVideo(u, stream, eu) {
  let el = $(`#enc-videos [data-u="${u}"]`);
  if (!el) { el = document.createElement('div'); el.className = 'enc-video' + (eu ? ' eu' : ''); el.dataset.u = u; el.style.setProperty('--c', hexDe(corDe(u)));
    el.innerHTML = `<div class="sem">${esc(iniciais(pessoa(u).nome))}</div><video autoplay playsinline ${eu ? 'muted' : ''}></video><b>${eu ? 'Você' : esc(pessoa(u).nome)}</b>`; $('#enc-videos').appendChild(el); }
  const v = $('video', el); v.srcObject = stream; v.hidden = !stream.getVideoTracks().length; return v;
}
function atualizarSub() { const n = (E.chamadas.get(ch.sala) || []).length; $('#enc-ch-sub').textContent = n > 1 ? `${n} pessoas` : 'esperando alguém entrar…'; }
$('#enc-desligar').addEventListener('click', () => sairDaChamada());
$('#enc-mic').addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; ch.local.getAudioTracks().forEach(t => { t.enabled = on; }); e.currentTarget.setAttribute('aria-pressed', String(on)); });
$('#enc-cam').addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; ch.local.getVideoTracks().forEach(t => { t.enabled = on; }); e.currentTarget.setAttribute('aria-pressed', String(on)); });
$('#enc-tela').addEventListener('click', async (e) => {
  const b = e.currentTarget, trocar = (faixa) => { for (const { pc } of ch.pares.values()) { const s = pc.getSenders().find(x => x.track && x.track.kind === 'video'); if (s) s.replaceTrack(faixa); } };
  if (ch.tela) { ch.tela.getTracks().forEach(t => t.stop()); ch.tela = null; trocar(ch.local.getVideoTracks()[0] || null); quadroVideo(E.eu.id, ch.local, true).parentElement.classList.remove('tela'); b.setAttribute('aria-pressed', 'false'); return; }
  try { ch.tela = await navigator.mediaDevices.getDisplayMedia({ video: true }); } catch { return; }
  const faixa = ch.tela.getVideoTracks()[0]; trocar(faixa); quadroVideo(E.eu.id, ch.tela, true).parentElement.classList.add('tela'); b.setAttribute('aria-pressed', 'true');
  faixa.onended = () => { if (ch.tela) b.click(); };
});

// ---------- transcrição e atas ----------
// Cada navegador transcreve só o próprio microfone e manda a frase final ao servidor. No fim, o Claude lê o trecho e escreve a ata.
// Dois jeitos de reconhecer a voz: a Web Speech API (no Chrome, o áudio vai aos servidores do Google) ou o Whisper local,
// que roda no próprio navegador e não deixa a voz sair da máquina. Sem Web Speech (Firefox, Safari), vai o Whisper.
const Reconhecer = window.SpeechRecognition || window.webkitSpeechRecognition;
const motor = () => { if (!window.SystemCityWhisper) return 'navegador'; try { return localStorage.getItem('sc-voz') || (Reconhecer ? 'navegador' : 'whisper'); } catch { return Reconhecer ? 'navegador' : 'whisper'; } };
$('#enc-motor').value = motor();
$('#enc-motor').addEventListener('change', (e) => { try { localStorage.setItem('sc-voz', e.target.value); } catch {} if (rec) { pararRec(); ajustarTranscricao(); } });
let rec = null;
function pararRec() { const r = rec; rec = null; if (!r) return; if (r.parar) r.parar(); else { r.onend = null; r.stop(); } }
function ajustarTranscricao() {
  const ligada = !!(ch.sala && E.transcricao.get(ch.sala)), b = $('#enc-transcrever'); b.setAttribute('aria-pressed', String(ligada));
  if (ligada && !rec && motor() === 'whisper') {
    if (!window.SystemCityWhisper || !ch.local) return; rec = { parar: null }; const meu = rec; let avisado = -1;
    legenda('Carregando o Whisper no seu navegador. Na primeira vez baixa o modelo (~150 MB).', true);
    SystemCityWhisper.iniciar(ch.local, (texto) => enviarWs({ t: 'fala', sala: ch.sala, texto }), { mudo: () => !micLigado(),
      aoProgresso: (p) => { if (p >= avisado + 25) { avisado = p; legenda(`Baixando o Whisper: ${p}%`, true); } } })
      .then(parar => { if (rec !== meu) return parar(); meu.parar = parar; legenda('Whisper pronto: a sua voz é transcrita aqui, sem sair da máquina.', true); })
      .catch(e => { if (rec === meu) rec = null; legenda('Não deu para carregar o Whisper: ' + e.message, true); });
  } else if (ligada && !rec) {
    if (!Reconhecer) { legenda('Este navegador não transcreve a sua voz (use Chrome ou Edge). As falas dos outros continuam entrando na ata.', true); return; }
    rec = new Reconhecer(); rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (ev) => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) { const texto = ev.results[i][0].transcript.trim(); if (texto && micLigado()) enviarWs({ t: 'fala', sala: ch.sala, texto }); } };
    rec.onerror = (ev) => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { rec.bloqueado = true; legenda('O navegador bloqueou a transcrição do seu microfone. As falas dos outros continuam entrando na ata.', true); } };
    rec.onend = () => { if (rec && !rec.bloqueado && ch.sala && E.transcricao.get(ch.sala)) try { rec.start(); } catch {} };   // o reconhecimento para sozinho de tempos em tempos: religa
    try { rec.start(); } catch {}
  } else if (!ligada && rec) pararRec();
}
const micLigado = () => $('#enc-mic').getAttribute('aria-pressed') === 'true';   // microfone mudo não transcreve
$('#enc-transcrever').addEventListener('click', () => enviarWs({ t: 'transcricao', sala: ch.sala, ligada: !E.transcricao.get(ch.sala) }));
function legenda(texto, aviso) { const el = $('#enc-legenda'); E.legendas.push({ texto, aviso }); E.legendas = E.legendas.slice(-3);
  el.innerHTML = E.legendas.map(l => `<p class="${l.aviso ? 'aviso' : ''}">${esc(l.texto)}</p>`).join(''); el.hidden = false; }

async function abrirAtas(sala) { if (painel.hidden) abrirPainel(true); E.aberta = sala; E.aba = 'conversas';
  const [atas, tr] = await Promise.all([api('GET', `/api/salas/${sala}/atas`), api('GET', `/api/salas/${sala}/transcricao`)]);
  E.vista = { tipo: 'atas', sala, atas, falas: tr.falas }; if (tr.gerando) E.gerando = sala; desenhar(); }
function desenharAtas() {
  const v = E.vista, s = E.salas.find(x => x.id === v.sala), gerando = E.gerando === v.sala;
  corpo.innerHTML = `<button class="enc-voltar" data-voltar>← ${esc(s ? nomeSala(s) : 'Conversa')}</button>
    <div class="enc-reuniao"><h4>Transcrição ainda sem ata</h4><p>${v.falas.length ? `${v.falas.length} fala${v.falas.length > 1 ? 's' : ''}, de ${[...new Set(v.falas.map(f => f.nome))].map(esc).join(', ')}` : 'Nada novo. Ligue "Transcrever" durante uma chamada nesta conversa.'}</p>
      ${v.falas.length ? `<details><summary>Ver o que foi dito</summary><div class="enc-falas">${v.falas.map(f => `<p><b>${esc(f.nome)}</b> ${esc(f.texto)}</p>`).join('')}</div></details>` : ''}
      <button class="bt forte cheio" id="enc-gerar" ${v.falas.length && !gerando ? '' : 'disabled'}>${gerando ? 'O Claude está escrevendo a ata…' : 'Gerar atividades com o Claude'}</button><p class="enc-erro" role="alert"></p></div>
    ${v.atas.length ? v.atas.map(a => `<button class="enc-item" data-ata="${a.id}"><i class="av" style="--c:${hexDe(corDe(a.id))}">✎</i><span>${esc(a.titulo)}<small>${dia(a.criada)} · ${hora(a.criada)} · por ${esc(pessoa(a.criada_por).nome)}</small></span></button>`).join('') : '<p class="enc-vazio">Nenhuma ata ainda.</p>'}`;
  $('[data-voltar]', corpo).addEventListener('click', () => { E.vista = null; desenhar(); });
  $$('[data-ata]', corpo).forEach(b => b.addEventListener('click', () => abrirAta(+b.dataset.ata, v.sala)));
  const g = $('#enc-gerar'); g.addEventListener('click', async () => { g.disabled = true; g.textContent = 'O Claude está escrevendo a ata…';
    try { const a = await api('POST', `/api/salas/${v.sala}/atas`, { bairros: C.BAIRROS.map(b => ({ id: b.id, nome: b.nome, desc: b.desc || b.sub || '' })) }); abrirAta(a.id, v.sala); } catch (e) { $('.enc-erro', corpo).textContent = e.message; g.disabled = false; g.textContent = 'Gerar atividades com o Claude'; } });
}
async function abrirAta(id, sala) { if (painel.hidden) abrirPainel(true); E.aberta = sala; const [ata, ativs] = await Promise.all([api('GET', `/api/atas/${id}`), api('GET', `/api/atas/${id}/atividades`).catch(() => [])]); E.vista = { tipo: 'ata', sala, ata, ativs }; desenhar(); }
function desenharAta() {
  const a = E.vista.ata, html = window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(a.markdown, { breaks: true })) : `<pre>${esc(a.markdown)}</pre>`;
  corpo.innerHTML = `<button class="enc-voltar" data-voltar>← Atas</button>
    <div class="enc-acoes" style="flex-wrap:wrap;margin-bottom:8px"><a class="bt" href="/api/atas/${a.id}.md" download>Baixar .md</a><button class="bt" id="enc-copiar">Copiar</button><button class="bt" id="enc-enviar-ata">Enviar para…</button></div>
    <div id="enc-enviar" hidden><div class="enc-escolha">${E.pessoas.filter(p => p.id !== E.eu.id).map(p => `<label class="marcar"><input type="radio" name="para" value="${p.id}">${esc(p.nome)}</label>`).join('') || '<small>Ninguém mais tem conta.</small>'}</div><button class="bt forte cheio" id="enc-enviar-ir">Mandar na conversa direta</button><p class="enc-erro" role="alert"></p></div>
    ${(E.vista.ativs || []).length ? `<div class="enc-ativs"><h4>Atividades <small>${E.vista.ativs.filter(x => x.feita).length}/${E.vista.ativs.length} feitas</small></h4>${E.vista.ativs.map(x => `<div class="enc-ativ ${x.feita ? 'feita' : ''}"><label><input type="checkbox" data-ativ="${x.id}" ${x.feita ? 'checked' : ''}><span><b>${esc(x.titulo)}</b><small>${[x.responsavel && 'com ' + x.responsavel, x.prazo && 'prazo ' + x.prazo, x.bairro && C.BAIRRO[x.bairro] && 'obra em ' + C.BAIRRO[x.bairro].nome].filter(Boolean).map(esc).join(' · ')}</small></span></label>
      ${x.ticket ? `<a class="bt" href="${esc(x.ticket)}" target="_blank" rel="noopener">Ticket</a>` : `<button class="bt" data-ticket="${x.id}">Abrir ticket</button>`}</div>`).join('')}</div>` : ''}
    <article class="enc-ata">${html}</article>`;
  $$('[data-ativ]', corpo).forEach(c => c.addEventListener('change', async () => { try { const x = await api('PATCH', `/api/atividades/${c.dataset.ativ}`, { feita: c.checked }); Object.assign(E.vista.ativs.find(y => y.id === x.id), x); desenhar(); } catch (e) { c.checked = !c.checked; alert(e.message); } }));
  $$('[data-ticket]', corpo).forEach(b => b.addEventListener('click', () => abrirTicket(E.vista.ativs.find(y => y.id === +b.dataset.ticket))));
  $('[data-voltar]', corpo).addEventListener('click', () => abrirAtas(E.vista.sala));
  $('#enc-copiar').addEventListener('click', async (e) => { await navigator.clipboard.writeText(a.markdown).catch(() => {}); e.target.textContent = 'Copiado'; });
  $('#enc-enviar-ata').addEventListener('click', () => { $('#enc-enviar').hidden = !$('#enc-enviar').hidden; });
  $('#enc-enviar-ir').addEventListener('click', async () => { const p = $('#enc-enviar input:checked'); if (!p) return;
    try { const s = await direta(+p.value); await api('POST', `/api/salas/${s.id}/mensagens`, { texto: a.markdown.slice(0, 4000) }); $('#enc-enviar').hidden = true; avisar(`Ata enviada para ${pessoa(+p.value).nome}.`); }
    catch (e) { $('#enc-enviar .enc-erro').textContent = e.message; } });
}

// abrir ticket: com TICKETS_NOVO_URL no servidor (ex.: https://github.com/dono/repo/issues/new?title={titulo}&body={corpo}) abre o formulário já preenchido;
// sem ele, copia o texto do ticket (isso só quando a equipe não ligou o sistema dela). Depois pergunta o link para guardar na atividade.
async function abrirTicket(x) {
  // com a integração da equipe ligada, o servidor cria o ticket direto no GitHub, Jira ou Linear
  try { const y = await api('POST', `/api/atividades/${x.id}/ticket`, {}); Object.assign(x, y); desenhar(); avisar('Ticket criado.'); return; }
  catch (e) { if (!/não tem um sistema de tickets|Rota não encontrada/.test(e.message)) return alert(e.message); }   // sem a integração (ou sem o Cloud), cai no jeito manual
  const corpoTxt = `${x.descricao || ''}\n\nResponsável: ${x.responsavel || 'a definir'}\nPrazo: ${x.prazo || 'a definir'}${x.bairro ? `\nMódulo: ${(C.BAIRRO[x.bairro] || {}).nome || x.bairro}` : ''}\n\nCombinado na ata "${E.vista.ata.titulo}" (SystemCity).`;
  if (E.eu.ticketsUrl) window.open(E.eu.ticketsUrl.replace('{titulo}', encodeURIComponent(x.titulo)).replace('{corpo}', encodeURIComponent(corpoTxt)), '_blank', 'noopener');
  else { await navigator.clipboard.writeText(`${x.titulo}\n\n${corpoTxt}`).catch(() => {}); avisar(`Texto do ticket copiado. Cole no ${E.eu.tickets || 'seu sistema de tickets'}.`); }
  const link = prompt('Cole aqui o link do ticket criado (ou deixe vazio):'); if (!link) return;
  try { const y = await api('PATCH', `/api/atividades/${x.id}`, { ticket: link }); Object.assign(x, y); desenhar(); } catch (e) { alert(e.message); }
}
function avisar(texto, aoClicar) { toque.dataset.sala = ''; toque.innerHTML = `<span>${esc(texto)}</span>${aoClicar ? '<button class="bt forte" id="enc-av-abrir">Abrir</button>' : ''}<button class="bt" id="enc-av-ok">OK</button>`; toque.hidden = false;
  if (aoClicar) $('#enc-av-abrir').onclick = () => { toque.hidden = true; aoClicar(); }; $('#enc-av-ok').onclick = () => { toque.hidden = true; }; }

const toque = $('#enc-toque');
function tocar(sala, quem) { const s = E.salas.find(x => x.id === sala), nomes = quem.map(u => pessoa(u).nome).join(', ');
  toque.dataset.sala = sala; toque.innerHTML = `<span><b>${esc(nomes)}</b> ${quem.length > 1 ? 'estão' : 'está'} em chamada${s && s.tipo !== 'direta' ? ` em ${esc(nomeSala(s))}` : ''}</span><button class="bt forte" id="enc-atender">Entrar</button><button class="bt" id="enc-recusar">Agora não</button>`;
  toque.hidden = false; $('#enc-atender').onclick = () => entrarNaChamada(sala); $('#enc-recusar').onclick = () => esconderToque(); }
function esconderToque(sala) { if (sala == null || +toque.dataset.sala === sala) toque.hidden = true; }

// ---------- as pessoas na cidade: um boneco com nome para cada um que está andando nesta cidade ----------
const bonecos = new Map(), THREE = window.THREE;
function placaNome(nome, cor) { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(6,11,20,.85)'; g.beginPath(); g.roundRect(4, 8, 248, 48, 14); g.fill(); g.fillStyle = hexDe(cor); g.font = '600 28px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nome.slice(0, 16), 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); s.scale.set(6, 1.5, 1); s.position.y = 3.6; s.renderOrder = 10; return s; }
function boneco(p) { const cor = corDe(p.id), g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.5 });
  const corpo3 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.6, 12), mat); corpo3.position.y = 1.1; g.add(corpo3);
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), mat); cabeca.position.y = 2.3; g.add(cabeca);
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 24), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); anel.rotation.x = -Math.PI / 2; anel.position.y = 0.35; g.add(anel);
  g.add(placaNome(p.nome || '?', cor)); C.scene.add(g); return { g, x: p.x, z: p.z }; }
function moverBonecos() {
  const aqui = new Set();
  for (const p of E.online.values()) { if (!E.eu || p.id === E.eu.id || p.x == null || p.cidade !== CIDADE) continue; aqui.add(p.id);
    const b = bonecos.get(p.id) || bonecos.set(p.id, boneco(p)).get(p.id); b.x = p.x; b.z = p.z; }
  for (const [id, b] of bonecos) if (!aqui.has(id)) { C.scene.remove(b.g); bonecos.delete(id); }
  for (const b of bonecos.values()) { b.g.position.x += (b.x - b.g.position.x) * 0.2; b.g.position.z += (b.z - b.g.position.z) * 0.2; b.g.position.y = C.alturaChao ? C.alturaChao(b.g.position.x, b.g.position.z) : 0.3; }
  requestAnimationFrame(moverBonecos);
}
let ultimaPos = '';
function mandarPosicao() { const a = C.andar, pos = a && a.ativo ? { x: +a.pos.x.toFixed(1), z: +a.pos.z.toFixed(1) } : { x: null }, k = JSON.stringify(pos);
  if (k !== ultimaPos) { ultimaPos = k; enviarWs({ t: 'posicao', cidade: CIDADE, ...pos }); } }

// ---------- partida ----------
async function iniciar() {
  for (const fn of E.aoEntrar || []) fn(E.eu);
  [E.pessoas, E.salas, E.reunioes] = await Promise.all([api('GET', '/api/pessoas'), api('GET', '/api/salas'), api('GET', '/api/reunioes')]);
  contarNovas(); conectar(); setInterval(mandarPosicao, 250);
  // atalhos vindos da página de equipes: ?sala=<id> abre a conversa, ?chamada=<id> entra na chamada
  const p = new URLSearchParams(location.search), sala = +p.get('sala'), chamada = +p.get('chamada'), s = E.salas.find(x => x.id === (sala || chamada));
  if (s && chamada) setTimeout(() => entrarNaChamada(chamada), 600); else if (s) abrirSala(s);
}
api('GET', '/api/eu').then(eu => { E.eu = eu; botao.hidden = false; return iniciar(); })
  .catch(e => { if (e.status === 401) botao.hidden = false; })   // sem servidor (hospedagem estática): o botão nem aparece
  .finally(() => { if (THREE && C.scene) requestAnimationFrame(moverBonecos); });
C.encontros = { online: () => [...E.online.values()], abrirSala: (id) => { const s = E.salas.find(x => x.id === id); if (s) abrirSala(s); else api('GET', '/api/salas').then(l => { E.salas = l; const t = l.find(x => x.id === id); if (t) abrirSala(t); }); }, abrirAta, abrirAtas, abrir: () => abrirPainel(true), entrarNaChamada, sairDaChamada, eu: () => E.eu, api, enviar: enviarWs, ouvir: (fn) => ouvintes.push(fn), naChamada: () => ch.sala,
  pedirEntrada: () => { entrada.hidden = false; $('#enc-e-email').focus(); }, aoEntrar: (fn) => (E.aoEntrar ??= []).push(fn) };
})();
