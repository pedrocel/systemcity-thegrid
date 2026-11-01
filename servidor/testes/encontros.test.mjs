// Testes de ponta a ponta do servidor: sobe numa porta livre com banco em memória e conversa por HTTP e WebSocket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { criarServidor } from '../index.mjs';

let app, base;
let pedidoRecebido = null;
process.env.INCIDENTES_TOKEN = 'token-de-teste-123';
before(async () => { app = criarServidor({ gerarAta: async (pedido) => { pedidoRecebido = pedido; return pedidoRecebido.includes('Post-mortem') ? '# Post-mortem\n\n## Ações para não repetir\n- [ ] **Alarme no gateway** — responsável: tom — prazo: sexta — bairro: pagamentos\n' : '# Ata de teste\n\n## Atividades\n- [ ] **Fazer X** — responsável: max — prazo: sexta — bairro: pedidos\n  Detalhe do X.'; }, corrida: { contagemMs: 100, voltaMinMs: 50 }, comLimites: false, conferirConexao: false }); await new Promise(ok => app.servidor.listen(0, ok)); base = `http://127.0.0.1:${app.servidor.address().port}`; });
after(() => app.fechar());

async function api(metodo, caminho, corpo, cookie) {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text(); return { status: r.status, corpo: txt ? JSON.parse(txt) : null, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
async function pessoa(nome) { const r = await api('POST', '/api/cadastro', { email: `${nome}@teste.com`, nome, senha: 'senha-segura' }); assert.equal(r.status, 201); return { ...r.corpo, cookie: r.cookie }; }
function socket(p) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws', { headers: { cookie: p.cookie } }), fila = [], espera = [];
  ws.on('message', (b) => { const m = JSON.parse(b); const i = espera.findIndex(e => e.filtro(m)); if (i >= 0) espera.splice(i, 1)[0].ok(m); else fila.push(m); });
  ws.receber = (filtro) => new Promise((ok, falha) => { const i = fila.findIndex(filtro); if (i >= 0) return ok(fila.splice(i, 1)[0]); espera.push({ filtro, ok }); setTimeout(() => falha(new Error('nada chegou')), 2000); });
  return new Promise(ok => ws.on('open', () => ok(ws)));
}

test('cadastro, entrada e sessão', async () => {
  const ana = await pessoa('ana');
  assert.equal((await api('GET', '/api/eu', null, ana.cookie)).corpo.email, 'ana@teste.com');
  assert.equal((await api('POST', '/api/cadastro', { email: 'ana@teste.com', nome: 'Ana 2', senha: 'senha-segura' })).status, 409);
  assert.equal((await api('POST', '/api/entrar', { email: 'ana@teste.com', senha: 'errada123' })).status, 401);
  const entrou = await api('POST', '/api/entrar', { email: 'ANA@teste.com', senha: 'senha-segura' }); assert.equal(entrou.status, 200);
  await api('POST', '/api/sair', {}, entrou.cookie);
  assert.equal((await api('GET', '/api/eu', null, entrou.cookie)).status, 401);
  assert.equal((await api('GET', '/api/eu')).status, 401);
});

test('conversa direta: mensagens chegam em tempo real e só para os membros', async () => {
  const bia = await pessoa('bia'), caio = await pessoa('caio'), duda = await pessoa('duda');
  const sala = (await api('POST', '/api/diretas', { com: caio.id }, bia.cookie)).corpo;
  assert.equal((await api('POST', '/api/diretas', { com: bia.id }, caio.cookie)).corpo.id, sala.id, 'a mesma conversa para os dois');
  const wsCaio = await socket(caio);
  await api('POST', `/api/salas/${sala.id}/mensagens`, { texto: 'oi, caio' }, bia.cookie);
  assert.equal((await wsCaio.receber(m => m.t === 'mensagem')).mensagem.texto, 'oi, caio');
  assert.equal((await api('GET', `/api/salas/${sala.id}/mensagens`, null, duda.cookie)).status, 403, 'quem não é membro não lê');
  assert.equal((await api('POST', `/api/salas/${sala.id}/mensagens`, { texto: 'intruso' }, duda.cookie)).status, 403);
  const lista = (await api('GET', '/api/salas', null, caio.cookie)).corpo.find(s => s.id === sala.id); assert.equal(lista.novas, 1);
  wsCaio.close();
});

test('reunião: convite, resposta e sala própria', async () => {
  const eva = await pessoa('eva'), fabio = await pessoa('fabio');
  const inicio = Date.now() + 3600e3, r = (await api('POST', '/api/reunioes', { titulo: 'Planejamento', inicio, fim: inicio + 1800e3, convidados: [fabio.id] }, eva.cookie)).corpo;
  assert.equal(r.titulo, 'Planejamento');
  const deFabio = (await api('GET', '/api/reunioes', null, fabio.cookie)).corpo.find(x => x.id === r.id); assert.equal(deFabio.minha_resposta, 'pendente');
  assert.equal((await api('POST', `/api/reunioes/${r.id}/resposta`, { resposta: 'sim' }, fabio.cookie)).status, 204);
  assert.equal((await api('GET', '/api/reunioes', null, fabio.cookie)).corpo.find(x => x.id === r.id).minha_resposta, 'sim');
  assert.ok((await api('GET', '/api/salas', null, fabio.cookie)).corpo.some(s => s.id === r.sala && s.tipo === 'reuniao'));
  assert.equal((await api('POST', '/api/reunioes', { titulo: 'x', inicio, fim: inicio - 1 }, eva.cookie)).status, 400);
});

test('chamada: presença na chamada e sinal só entre participantes', async () => {
  const gil = await pessoa('gil'), hel = await pessoa('hel'), ivo = await pessoa('ivo');
  const sala = (await api('POST', '/api/diretas', { com: hel.id }, gil.cookie)).corpo;
  const wsGil = await socket(gil), wsHel = await socket(hel), wsIvo = await socket(ivo);
  wsGil.send(JSON.stringify({ t: 'chamada:entrar', sala: sala.id }));
  assert.deepEqual((await wsHel.receber(m => m.t === 'chamada' && m.participantes.length === 1)).participantes, [gil.id], 'o outro membro vê a chamada tocando');
  wsIvo.send(JSON.stringify({ t: 'chamada:entrar', sala: sala.id }));   // não é membro: ignorado
  wsHel.send(JSON.stringify({ t: 'chamada:entrar', sala: sala.id }));
  await wsGil.receber(m => m.t === 'chamada' && m.participantes.length === 2);
  wsGil.send(JSON.stringify({ t: 'sinal', sala: sala.id, para: hel.id, dados: { tipo: 'oferta' } }));
  assert.deepEqual((await wsHel.receber(m => m.t === 'sinal')).dados, { tipo: 'oferta' });
  wsIvo.send(JSON.stringify({ t: 'sinal', sala: sala.id, para: hel.id, dados: { tipo: 'invasor' } }));
  await assert.rejects(wsHel.receber(m => m.t === 'sinal'), 'sinal de quem está fora da chamada não passa');
  for (const w of [wsGil, wsHel, wsIvo]) w.close();
});

test('presença: posição na cidade chega aos outros', async () => {
  const jon = await pessoa('jon'), kat = await pessoa('kat');
  const wsJon = await socket(jon), wsKat = await socket(kat);
  wsJon.send(JSON.stringify({ t: 'posicao', cidade: 'exemplo', x: 10, z: -5 }));
  const p = await wsKat.receber(m => m.t === 'presenca' && m.pessoas.some(x => x.id === jon.id && x.x === 10));
  assert.equal(p.pessoas.find(x => x.id === jon.id).cidade, 'exemplo');
  wsJon.close(); wsKat.close();
});

test('arquivos do servidor não são servidos', async () => {
  assert.equal((await fetch(base + '/servidor/index.mjs')).status, 404);
  assert.equal((await fetch(base + '/../package.json')).status, 404);
  assert.equal((await fetch(base + '/index.html')).status, 200);
});

test('transcrição: só com a chamada ligada, e a ata pega o trecho novo', async () => {
  const lia = await pessoa('lia'), max = await pessoa('max'), ned = await pessoa('ned');
  const sala = (await api('POST', '/api/diretas', { com: max.id }, lia.cookie)).corpo;
  const wsLia = await socket(lia), wsMax = await socket(max);
  wsLia.send(JSON.stringify({ t: 'fala', sala: sala.id, texto: 'antes de ligar' }));   // sem transcrição ligada: ignorada
  for (const w of [wsLia, wsMax]) w.send(JSON.stringify({ t: 'chamada:entrar', sala: sala.id }));
  await wsLia.receber(m => m.t === 'chamada' && m.participantes.length === 2);
  wsLia.send(JSON.stringify({ t: 'transcricao', sala: sala.id, ligada: true }));
  await wsMax.receber(m => m.t === 'transcricao' && m.ligada);
  wsLia.send(JSON.stringify({ t: 'fala', sala: sala.id, texto: 'Max, você revisa o checkout até sexta?' }));
  wsMax.send(JSON.stringify({ t: 'fala', sala: sala.id, texto: 'Reviso sim.' }));
  assert.equal((await wsLia.receber(m => m.t === 'fala' && m.fala.autor === max.id)).fala.texto, 'Reviso sim.', 'legenda chega a quem está na chamada');
  const tr = (await api('GET', `/api/salas/${sala.id}/transcricao`, null, lia.cookie)).corpo;
  assert.deepEqual(tr.falas.map(f => f.texto), ['Max, você revisa o checkout até sexta?', 'Reviso sim.']);
  assert.equal((await api('GET', `/api/salas/${sala.id}/transcricao`, null, ned.cookie)).status, 403);

  const ata = await api('POST', `/api/salas/${sala.id}/atas`, {}, max.cookie);
  assert.equal(ata.status, 201); assert.match(ata.corpo.markdown, /Fazer X/);
  assert.match(pedidoRecebido, /lia: Max, você revisa o checkout até sexta\?/); assert.match(pedidoRecebido, /Participantes: lia, max/);
  assert.equal((await api('GET', `/api/salas/${sala.id}/transcricao`, null, lia.cookie)).corpo.falas.length, 0, 'depois da ata o trecho zera');
  assert.equal((await api('POST', `/api/salas/${sala.id}/atas`, {}, lia.cookie)).status, 400, 'sem fala nova não gera outra');
  const md = await fetch(`${base}/api/atas/${ata.corpo.id}.md`, { headers: { cookie: lia.cookie } });
  assert.match(md.headers.get('content-disposition'), /attachment; filename=".+\.md"/); assert.match(await md.text(), /# Ata de teste/);
  assert.equal((await api('GET', `/api/atas/${ata.corpo.id}`, null, ned.cookie)).status, 403);
  wsLia.close(); wsMax.close();
});

test('The Grid: corrida com sala própria, largada, posições, voltas e ranking', async () => {
  const ota = await pessoa('ota'), pia = await pessoa('pia'), quim = await pessoa('quim');
  const wsOta = await socket(ota), wsPia = await socket(pia);
  const criada = (await api('POST', '/api/corridas', { nome: 'Daily', voltas: 2, limiteMin: 5 }, ota.cookie)).corpo;
  assert.equal(criada.corrida.voltas, 2); const id = criada.corrida.id;
  assert.ok((await wsPia.receber(m => m.t === 'corridas' && m.lista.some(c => c.id === id))), 'quem está online vê a corrida aberta');
  const entrou = (await api('POST', `/api/corridas/${id}/entrar`, {}, pia.cookie)).corpo;
  assert.equal(entrou.corrida.jogadores.length, 2); assert.notEqual(entrou.corrida.jogadores[0].cor, entrou.corrida.jogadores[1].cor, 'cada moto com uma cor');
  assert.ok((await api('GET', '/api/salas', null, pia.cookie)).corpo.some(s => s.id === criada.sala), 'a sala da corrida serve para a chamada da daily');

  wsPia.send(JSON.stringify({ t: 'corrida:largar', corrida: id }));   // só o dono larga
  wsOta.send(JSON.stringify({ t: 'corrida:largar', corrida: id }));
  await wsPia.receber(m => m.t === 'corrida' && m.corrida.estado === 'contagem');
  await wsPia.receber(m => m.t === 'corrida' && m.corrida.estado === 'correndo');
  wsOta.send(JSON.stringify({ t: 'corrida:pos', corrida: id, s: 0.4, d: 2, v: 50, dir: 0 }));
  const pos = await wsPia.receber(m => m.t === 'corrida:pos'); assert.equal(pos.u, ota.id); assert.equal(pos.s, 0.4);

  const quimEntra = (await api('POST', `/api/corridas/${id}/entrar`, {}, quim.cookie)).corpo;
  assert.equal(quimEntra.assistindo, true, 'depois da largada entra só para assistir');

  const volta = (ws, n) => new Promise(ok => setTimeout(() => { ws.send(JSON.stringify({ t: 'corrida:volta', corrida: id, volta: n })); ok(); }, 70));
  await volta(wsOta, 1); await volta(wsOta, 2);
  await volta(wsPia, 1); await volta(wsPia, 2);
  const fim = await wsOta.receber(m => m.t === 'corrida' && m.corrida.estado === 'fim');
  assert.deepEqual(fim.corrida.ranking.map(r => r.u), [ota.id, pia.id]);
  assert.ok(fim.corrida.ranking[0].tempo > 0 && fim.corrida.ranking[0].melhor > 0);
  const [p1, p2] = fim.corrida.ranking; assert.equal(p1.pontosPos, 25); assert.equal(p2.pontosPos, 18);
  assert.ok(p1.bonus.some(b => b.nome === 'completou a prova'));
  assert.equal(fim.corrida.ranking.filter(r => r.bonus.some(b => b.nome === 'melhor volta')).length >= 1, true, 'alguém leva a melhor volta');
  const mes = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 7), placar = (await api('GET', `/api/grid/placar?temporada=${mes}`, null, pia.cookie)).corpo;
  const linhaOta = placar.linhas.find(x => x.u === ota.id); assert.equal(linhaOta.vitorias, 1); assert.equal(linhaOta.pontos, p1.pontos);
  assert.ok(linhaOta.conquistas.some(q => q.id === 'campeao'), 'o primeiro do mês é o campeão da temporada');
  assert.equal((await api('GET', '/api/grid/placar?temporada=2001-01', null, pia.cookie)).corpo.linhas.length, 0);
  wsOta.close(); wsPia.close();
});

test('nick: cadastro, entrar pelo nick e busca', async () => {
  assert.equal((await api('POST', '/api/cadastro', { email: 'rui@teste.com', nome: 'Rui Barros', senha: 'senha-segura', nick: 'rui barros!' })).status, 400, 'espaço e símbolo não valem');
  const ok = await api('POST', '/api/cadastro', { email: 'rui@teste.com', nome: 'Rui Barros', senha: 'senha-segura', nick: '@Rui.B' });
  assert.equal(ok.corpo.nick, 'rui.b', '@ e maiúsculas são normalizados');
  assert.equal((await api('POST', '/api/cadastro', { email: 'rui2@teste.com', nome: 'Outro', senha: 'senha-segura', nick: 'rui.b' })).status, 409);
  assert.equal((await api('POST', '/api/entrar', { email: '@rui.b', senha: 'senha-segura' })).status, 200, 'entra pelo nick');
  const sem = await pessoa('sol'); assert.equal(sem.nick, 'sol', 'sem nick, sai um do e-mail');
  const achados = (await api('GET', '/api/usuarios/busca?q=ru', null, sem.cookie)).corpo;
  assert.deepEqual(achados.map(u => u.nick), ['rui.b']);
});

test('equipes: criar, adicionar pelo nick, papéis e sair', async () => {
  const tom = await pessoa('tom'), uli = await pessoa('uli'), val = await pessoa('val');
  const eq = (await api('POST', '/api/equipes', { nome: 'Plataforma' }, tom.cookie)).corpo;
  assert.equal(eq.meuPapel, 'dono');
  const add = await api('POST', `/api/equipes/${eq.id}/membros`, { nick: '@uli' }, tom.cookie);
  assert.equal(add.status, 201); assert.deepEqual(add.corpo.membros.map(m => m.nick), ['tom', 'uli']);
  assert.equal((await api('POST', `/api/equipes/${eq.id}/membros`, { nick: 'ninguem' }, tom.cookie)).status, 404);
  assert.equal((await api('POST', `/api/equipes/${eq.id}/membros`, { nick: 'val' }, uli.cookie)).status, 403, 'membro comum não adiciona');
  assert.ok((await api('GET', '/api/salas', null, uli.cookie)).corpo.some(s => s.id === eq.sala), 'quem entra ganha a conversa da equipe');
  assert.equal((await api('GET', `/api/equipes/${eq.id}`, null, val.cookie)).status, 403, 'quem está fora não vê');
  await api('PATCH', `/api/equipes/${eq.id}/membros/${uli.id}`, { papel: 'admin' }, tom.cookie);
  assert.equal((await api('POST', `/api/equipes/${eq.id}/membros`, { nick: 'val' }, uli.cookie)).status, 201, 'admin adiciona');
  assert.equal((await api('DELETE', `/api/equipes/${eq.id}/membros/${tom.id}`, {}, tom.cookie)).status, 409, 'dono não sai sem passar a equipe');
  await api('PATCH', `/api/equipes/${eq.id}/membros/${uli.id}`, { papel: 'dono' }, tom.cookie);
  assert.equal((await api('DELETE', `/api/equipes/${eq.id}/membros/${tom.id}`, {}, tom.cookie)).status, 204, 'depois de passar, sai');
  assert.equal((await api('GET', '/api/salas', null, tom.cookie)).corpo.some(s => s.id === eq.sala), false, 'e perde a conversa da equipe');
  assert.equal((await api('GET', `/api/equipes/${eq.id}`, null, uli.cookie)).corpo.dono, uli.id);
});

test('cidades: modelo, permissão, atividades viram obras e incidente vira sala de guerra', async () => {
  const wes = await pessoa('wes'), xan = await pessoa('xan'), yuri = await pessoa('yuri');
  const eq = (await api('POST', '/api/equipes', { nome: 'Loja' }, wes.cookie)).corpo;
  await api('POST', `/api/equipes/${eq.id}/membros`, { nick: 'xan' }, wes.cookie);
  const c = (await api('POST', '/api/cidades/modelo', { modelo: 'ecommerce', equipe: eq.id }, wes.cookie)).corpo;
  assert.equal(c.nome, 'Loja online');
  const js = await (await fetch(`${base}/api/cidades/${c.slug}/cidade.js`, { headers: { cookie: xan.cookie } })).text();
  assert.match(js, /^SystemCity\.definir\(/); assert.match(js, /"pg-autoriza"/);
  assert.equal((await fetch(`${base}/api/cidades/${c.slug}/cidade.js`, { headers: { cookie: yuri.cookie } })).status, 404, 'quem está fora da equipe não vê');
  assert.ok((await api('GET', '/api/cidades', null, xan.cookie)).corpo.cidades.some(x => x.slug === c.slug));

  // ata com bairro: a atividade vira obra no bairro
  const sala = eq.sala, wsW = await socket(wes), wsX = await socket(xan);
  for (const w of [wsW, wsX]) w.send(JSON.stringify({ t: 'chamada:entrar', sala }));
  await wsW.receber(m => m.t === 'chamada' && m.participantes.length === 2);
  wsW.send(JSON.stringify({ t: 'transcricao', sala, ligada: true })); await wsX.receber(m => m.t === 'transcricao' && m.ligada);
  wsW.send(JSON.stringify({ t: 'fala', sala, texto: 'xan, corrige o carrinho até sexta' })); await wsX.receber(m => m.t === 'fala');
  const ata = (await api('POST', `/api/salas/${sala}/atas`, { bairros: [{ id: 'pedidos', nome: 'Pedidos' }] }, wes.cookie)).corpo;
  assert.match(pedidoRecebido, /pedidos — Pedidos/);
  assert.equal(ata.atividades[0].bairro, 'pedidos'); assert.equal(ata.atividades[0].responsavel, 'max'); assert.equal(ata.atividades[0].descricao, 'Detalhe do X.');
  const obras = (await api('GET', '/api/obras?bairros=pedidos,pagamentos', null, xan.cookie)).corpo; assert.equal(obras.length, 1);
  await api('PATCH', `/api/atividades/${obras[0].id}`, { feita: true, ticket: 'https://tickets/1' }, xan.cookie);
  assert.equal((await api('GET', '/api/obras', null, xan.cookie)).corpo.length, 0, 'feita, a obra some');
  assert.equal((await api('PATCH', `/api/atividades/${obras[0].id}`, { feita: false }, yuri.cookie)).status, 403);

  // incidente pelo webhook: prédio pega fogo, o time é chamado e ganha a sala de guerra
  assert.equal((await fetch(`${base}/api/incidentes/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-systemcity-token': 'errado-errado-errad' }, body: '{}' })).status, 401);
  const r = await fetch(`${base}/api/incidentes/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-systemcity-token': 'token-de-teste-123' },
    body: JSON.stringify({ cidade: c.slug, predio: 'pg-autoriza', titulo: 'Pagamentos recusando tudo', severidade: 'critica', origem: 'sentry' }) });
  assert.equal(r.status, 201); const inc = await r.json();
  assert.equal((await wsX.receber(m => m.t === 'incidente')).incidente.predio, 'pg-autoriza');
  assert.ok((await api('GET', '/api/salas', null, xan.cookie)).corpo.some(s => s.id === inc.sala && /Pagamentos recusando/.test(s.nome)));
  await api('POST', `/api/salas/${inc.sala}/mensagens`, { texto: 'o gateway caiu, voltou às 10h' }, xan.cookie);
  const pronto = (await api('POST', `/api/incidentes/${inc.id}/resolver`, {}, xan.cookie)).corpo;
  assert.ok(pronto.resolvido); assert.match(pedidoRecebido, /o gateway caiu/);
  assert.ok((await api('GET', '/api/obras?bairros=pagamentos', null, wes.cookie)).corpo.some(a => a.titulo === 'Alarme no gateway'), 'ações do post-mortem viram obras');
  assert.equal((await api('POST', `/api/incidentes/${inc.id}/resolver`, {}, wes.cookie)).status, 409);
  wsW.close(); wsX.close();
});

test('The Grid: daily guiada passa a vez em ordem', async () => {
  const zeca = await pessoa('zeca'), ana2 = await pessoa('anabel');
  const wsZ = await socket(zeca), wsA = await socket(ana2);
  const c = (await api('POST', '/api/corridas', { nome: 'Daily', voltas: 3, limiteMin: 5, daily: true, falaSeg: 30 }, zeca.cookie)).corpo; const id = c.corrida.id;
  assert.equal(c.corrida.daily.falaSeg, 30);
  await api('POST', `/api/corridas/${id}/entrar`, {}, ana2.cookie);
  wsZ.send(JSON.stringify({ t: 'corrida:largar', corrida: id }));
  const primeira = await wsA.receber(m => m.t === 'corrida' && m.corrida.estado === 'correndo' && m.corrida.daily.vez === 0);
  assert.deepEqual(primeira.corrida.daily.ordem, [zeca.id, ana2.id]);
  wsA.send(JSON.stringify({ t: 'corrida:proximo', corrida: id }));   // não é a vez dela nem a dona: ignorado
  wsZ.send(JSON.stringify({ t: 'corrida:proximo', corrida: id }));
  assert.equal((await wsA.receber(m => m.t === 'corrida' && m.corrida.daily.vez === 1)).corrida.daily.ordem[1], ana2.id);
  wsZ.send(JSON.stringify({ t: 'corrida:encerrar', corrida: id })); await wsA.receber(m => m.t === 'corrida' && m.corrida.estado === 'fim');
  wsZ.close(); wsA.close();
});

test('replay: grava instantes de 10 em 10 s e devolve a linha do tempo', async () => {
  const bia2 = await pessoa('bia2'), fora = await pessoa('fora');
  const c = (await api('POST', '/api/cidades/modelo', { modelo: 'saas' }, bia2.cookie)).corpo;
  assert.equal((await api('POST', `/api/cidades/${c.slug}/instante`, { filas: { 'cb-cobra': 3, 'ap-auth': 0, 'x y': 2 } }, bia2.cookie)).corpo.gravado, true);
  assert.equal((await api('POST', `/api/cidades/${c.slug}/instante`, { filas: { 'cb-cobra': 9 } }, bia2.cookie)).corpo.gravado, false, 'só um a cada ~10 s');
  const linha = (await api('GET', `/api/cidades/${c.slug}/linha`, null, bia2.cookie)).corpo;
  assert.deepEqual(linha.instantes.map(i => i.f), [{ 'cb-cobra': 3 }], 'zeros e chaves estranhas ficam de fora');
  assert.equal((await api('GET', `/api/cidades/${c.slug}/linha`, null, fora.cookie)).status, 404);
});

test('planos: com PLANOS=1 a equipe grátis para em 5 pessoas', async () => {
  process.env.PLANOS = '1';
  try {
    const dono = await pessoa('dono5'), eq = (await api('POST', '/api/equipes', { nome: 'Cinco' }, dono.cookie)).corpo;
    for (const n of ['p1x', 'p2x', 'p3x', 'p4x']) { await pessoa(n); assert.equal((await api('POST', `/api/equipes/${eq.id}/membros`, { nick: n }, dono.cookie)).status, 201); }
    await pessoa('p5x'); const r = await api('POST', `/api/equipes/${eq.id}/membros`, { nick: 'p5x' }, dono.cookie);
    assert.equal(r.status, 402); assert.match(r.corpo.erro, /Grátis vai até 5/);
    assert.equal((await api('GET', '/api/planos', null, dono.cookie)).corpo.meu, 'gratis');
  } finally { delete process.env.PLANOS; }
});

test('limites: login trava depois de 8 senhas erradas para a mesma conta', async () => {
  const outro = criarServidor({ comLimites: true }); await new Promise(ok => outro.servidor.listen(0, ok)); const b = `http://127.0.0.1:${outro.servidor.address().port}`;
  const post = (c, corpo) => fetch(b + c, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  try {
    await post('/api/cadastro', { email: 'alvo@teste.com', nome: 'Alvo', senha: 'senha-segura' });
    for (let i = 0; i < 8; i++) assert.equal((await post('/api/entrar', { email: 'alvo@teste.com', senha: 'errada-' + i })).status, 401);
    const r = await post('/api/entrar', { email: 'alvo@teste.com', senha: 'senha-segura' });
    assert.equal(r.status, 429, 'até a senha certa espera'); assert.match((await r.json()).erro, /Tente de novo em \d+ minuto/);
  } finally { await outro.fechar(); }
});

test('senha: redefinir pelo link, uma vez só, e derrubar as sessões antigas', async () => {
  const caio2 = await pessoa('caio2');
  assert.deepEqual((await api('POST', '/api/senha/esqueci', { email: 'ninguem@teste.com' })).corpo, { email: false }, 'conta que não existe responde igual');
  const { pedirRedefinicao } = (await import('../contas.mjs')).contas(app.db), { token } = pedirRedefinicao('caio2@teste.com');
  assert.equal((await api('POST', '/api/senha/redefinir', { token, senha: 'curta' })).status, 400);
  const ok = await api('POST', '/api/senha/redefinir', { token, senha: 'senha-nova-123' }); assert.equal(ok.status, 200);
  assert.equal((await api('GET', '/api/eu', null, caio2.cookie)).status, 401, 'a sessão antiga caiu');
  assert.equal((await api('POST', '/api/entrar', { email: 'caio2@teste.com', senha: 'senha-nova-123' })).status, 200);
  assert.equal((await api('POST', '/api/senha/redefinir', { token, senha: 'outra-senha-1' })).status, 410, 'o link vale uma vez');
});

test('cidade do GitHub: webhook assinado e diferença entre versões', async () => {
  const { diferencas } = await import('../cidades.mjs');
  const antes = { bairros: [{ id: 'a', nome: 'A', estacoes: [{ id: 'a1', nome: 'Um' }, { id: 'a2', nome: 'Dois' }] }], externos: [] };
  const depois = { bairros: [{ id: 'a', nome: 'A', estacoes: [{ id: 'a1', nome: 'Um' }, { id: 'a3', nome: 'Três' }] }, { id: 'b', nome: 'B', estacoes: [] }], externos: [{ id: 'x', nome: 'X' }] };
  assert.deepEqual(diferencas(antes, depois), { bairrosNovos: ['B'], bairrosSairam: [], prediosNovos: ['Três (A)', 'X (de fora)'], prediosSairam: ['Dois (A)'] });
  const dona = await pessoa('dona'), c = (await api('POST', '/api/cidades/modelo', { modelo: 'saas' }, dona.cookie)).corpo;
  app.db.prepare("UPDATE cidades SET fonte = 'github:dono/repo' WHERE slug = ?").run(c.slug);
  const { segredo, url } = (await api('GET', `/api/cidades/${c.slug}/webhook`, null, dona.cookie)).corpo; assert.match(url, new RegExp(`/api/cidades/${c.slug}/github$`));
  const corpo = JSON.stringify({ zen: 'oi' }), { createHmac } = await import('node:crypto'), assinar = (k) => 'sha256=' + createHmac('sha256', k).update(corpo).digest('hex');
  const envia = (ass, ev) => fetch(`${base}/api/cidades/${c.slug}/github`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': ass, 'x-github-event': ev }, body: corpo });
  assert.equal((await envia(assinar('segredo-errado'), 'ping')).status, 401);
  assert.equal((await envia(assinar(segredo), 'ping')).status, 200);
  assert.equal((await api('GET', `/api/cidades/${c.slug}/webhook`, null, (await pessoa('intrusa')).cookie)).status, 403);
});

test('custos de IA: cada chamada é anotada com quem pediu e o tipo, e o admin vê o relatório', async () => {
  const { comUso, anotar } = await import('../custos.mjs');
  const ida = await pessoa('ida-custo'); process.env.ADMINS = 'ida-custo@teste.com';
  try {
    comUso({ usuario: ida.id, tipo: 'auditoria', alvo: 'acme/loja', registrar: app.custos.registrar }, () => anotar({ modelo: 'claude-opus-5-5', via: 'api', uso: { input_tokens: 1e6, output_tokens: 1e5 } }));
    comUso({ usuario: ida.id, tipo: 'cidade', registrar: app.custos.registrar }, () => anotar({ modelo: 'claude-code', via: 'claude-code', custo: 0.5 }));
    const r = (await api('GET', '/api/admin/custos', null, ida.cookie)).corpo;
    const aud = r.porTipo.find(t => t.tipo === 'auditoria'); assert.ok(Math.abs(aud.custo - 6) < 1e-9, '1M de entrada a $4 + 100k de saída a $20 = $6');
    assert.ok(r.porPessoa.find(p => p.email === 'ida-custo@teste.com').custo >= 6.5);
    const outra = await pessoa('ze-custo'); assert.equal((await api('GET', '/api/admin/custos', null, outra.cookie)).status, 403, 'só admin');
  } finally { delete process.env.ADMINS; }
});

test('link público: quem criou liga e desliga; o link mostra o mapa sem pastas, sem conta', async () => {
  const lu = await pessoa('lu-pub'), ze = await pessoa('ze-pub');
  const c = (await api('POST', '/api/cidades/modelo', { modelo: 'saas' }, lu.cookie)).corpo;
  assert.equal((await api('POST', `/api/cidades/${c.slug}/publico`, {}, ze.cookie)).status, 404, 'quem não vê a cidade não compartilha');
  const { publico } = (await api('POST', `/api/cidades/${c.slug}/publico`, {}, lu.cookie)).corpo; assert.ok(publico.length >= 16);
  const js = await (await fetch(`${base}/api/publico/${publico}/cidade.js`)).text(); assert.match(js, /^SystemCity\.definir\(/); assert.doesNotMatch(js, /"pastas"/);
  await api('POST', `/api/cidades/${c.slug}/publico`, { ligar: false }, lu.cookie);
  assert.equal((await fetch(`${base}/api/publico/${publico}/cidade.js`)).status, 404, 'desligado, o link morre');
});
