// SystemCity servidor: serve a cidade e a API dos encontros (contas, pessoas, conversas, agenda) no mesmo endereço,
// para o cookie de sessão valer nos dois. Tempo real em /ws (tempo-real.mjs).
//
// Uso:  node index.mjs        PORTA=4400  BANCO=dados/encontros.db  ORIGENS=https://cidade.minhaempresa.com
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrir } from './db.mjs';
import { contas as criarContas, lerCookie, ErroUso } from './contas.mjs';
import { conversas as criarConversas } from './conversas.mjs';
import { tempoReal } from './tempo-real.mjs';
import { montarPedido, gerarComClaude } from './atas.mjs';
import { corridas as criarCorridas } from './corridas.mjs';
import { equipes as criarEquipes } from './equipes.mjs';
import { tickets as criarTickets } from './tickets.mjs';
import { oauth as criarOauth, provedoresLigados, conectarGithub, githubOauthLigado } from './oauth.mjs';
import { conexoes as criarConexoes } from './fontes.mjs';
import { custos as criarCustos, comUso } from './custos.mjs';
import { kiwify as criarKiwify, kiwifyLigada } from './kiwify.mjs';
import { cobranca as criarCobranca, cobrancaLigada } from './cobranca.mjs';
import { cidades as criarCidades } from './cidades.mjs';
import { comoRoda } from './ia.mjs';
import { assistente as criarAssistente } from './assistente.mjs';
import { incidentes as criarIncidentes } from './incidentes.mjs';
import { replay as criarReplay } from './replay.mjs';
import { planos as criarPlanos, PLANOS } from './planos.mjs';
import { limitador, ipDe } from './limites.mjs';
import { enviarEmail, emailLigado } from './email.mjs';
import { universos as criarUniversos } from './universos.mjs';
import { historia as criarHistoria } from './historia.mjs';
import { auditorias as criarAuditorias } from './auditoria.mjs';
import { agentes as criarAgentes } from './agente.mjs';

const RAIZ = resolve(fileURLToPath(import.meta.url), '../..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };
const PROIBIDO = /(^|\/)(servidor|bridge|node_modules|scripts|\.git)(\/|$)|(^|\/)\./;   // só a cidade é pública

export function criarServidor({ banco = ':memory:', origens = null, seguro = false, tls = null, gerarAta = gerarComClaude, corrida = {}, comLimites = true, auditoria: opAuditoria = {}, buscarTickets = fetch, buscarOauth = fetch, buscarStripe = fetch, conferirConexao = true } = {}) {
  const db = abrir(banco), contas = criarContas(db), conversas = criarConversas(db);
  // cada requisição carrega quem pediu e o tipo de trabalho: as chamadas ao Claude que ela fizer (agora ou em segundo plano) são contadas nessa conta
  // admins: e-mails em ADMINS (separados por vírgula); veem o painel de custos
  const exigeAdmin = (eu) => { if (!(process.env.ADMINS || '').toLowerCase().split(',').map(x => x.trim()).includes(eu.email)) throw new ErroUso('Só administradores.', 403); };
  const tipoDe = (url) => { const c = url.split('?')[0];
    return /\/auditoria/.test(c) ? 'auditoria' : /\/universos\//.test(c) ? 'universo' : /\/api\/cidades\/(github|[a-z0-9-]+\/(regerar|github))/.test(c) ? 'cidade' : /\/atas|\/ata\b/.test(c) ? 'ata'
      : /perguntar|roteiro|tour/.test(c) ? 'pergunta' : /incidentes/.test(c) ? 'incidente' : /agentes/.test(c) ? 'agente' : 'outro'; };
  const tratar = (req, res) => { const quem = contas.deToken(lerCookie(req, contas.COOKIE));
    return comUso({ usuario: quem ? quem.id : null, tipo: tipoDe(req.url || ''), registrar: custos.registrar }, () => atender(req, res)).catch(e => falhar(res, e)); };
  const servidor = tls ? https.createServer(tls, tratar) : http.createServer(tratar);
  const ganchos = {}, rt = tempoReal(servidor, { contas, conversas, origens, ganchos }), corridas = criarCorridas({ db, conversas, contas, rt, ...corrida });
  const equipes = criarEquipes(db, { contas, conversas }), custos = criarCustos(db), assinaturas = criarKiwify(db), conexoes = criarConexoes(db), ghConexao = conectarGithub({ conexoes, buscar: buscarOauth }), cidades = criarCidades(db, { equipes, conexoes }), assistente = criarAssistente({ cidades, conversas, equipes }), incidentes = criarIncidentes(db, { cidades, conversas, equipes, contas, rt, gerar: gerarAta }), replay = criarReplay(db, { cidades }), planos = criarPlanos(db, { assinaturas, custos }), tickets = criarTickets(db, { equipes, conversas, buscar: buscarTickets }), social = criarOauth({ contas, buscar: buscarOauth }), cobranca = criarCobranca(db, { equipes, buscar: buscarStripe }), universos = criarUniversos(db, { cidades, equipes }), agentes = criarAgentes(db, { contas, rt, cidades }), historia = criarHistoria(db, { cidades, get universos() { return universos; } }), auditorias = criarAuditorias(db, { cidades, agentes, conexoes, ...opAuditoria }), limite = comLimites ? limitador() : { contar() {}, zerar() {}, fechar() {} };
  ganchos.mensagem = (u, m) => corridas.mensagem(u, m); ganchos.saiu = (u) => corridas.saiu(u);
  const gerando = new Set();   // salas com ata sendo gerada agora: uma por vez
  const limpeza = setInterval(() => contas.limparVencidas(), 3600e3); limpeza.unref();

  const origemDe = (req) => (origens && origens[0]) || `${req.headers['x-forwarded-proto'] || (tls ? 'https' : 'http')}://${req.headers.host}`;
  const json = (res, status, corpo, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }); res.end(corpo === undefined ? '' : JSON.stringify(corpo)); };
  function falhar(res, e) { if (res.headersSent) return res.end(); if (e instanceof ErroUso) return json(res, e.status, { erro: e.message }); console.error(e); json(res, 500, { erro: 'Erro interno.' }); }
  const cookie = (token, idade) => `${contas.COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${idade}${seguro ? '; Secure' : ''}`;
  async function corpo(req) { let s = ''; for await (const p of req) { s += p; if (s.length > 64 * 1024) throw new ErroUso('Corpo grande demais.', 413); } try { return s ? JSON.parse(s) : {}; } catch { throw new ErroUso('JSON inválido.'); } }

  async function atender(req, res) {
    const url = new URL(req.url, 'http://x'), caminho = url.pathname;
    if (caminho === '/saude') return json(res, 200, { ok: true });   // para o deploy e o monitoramento saberem que está de pé
    if (!caminho.startsWith('/api/') && !caminho.startsWith('/auth/') && !caminho.startsWith('/conectar/')) return estatico(caminho, res);
    // o universo, como um mapa só (mesmo formato de cidade.js)
    { const mu = caminho.match(/^\/api\/universos\/([a-z0-9-]+)\/(cidade|catalogo|textos-([a-z0-9-]+))\.js$/);
      if (mu && req.method === 'GET') { const eu = contas.deToken(lerCookie(req, contas.COOKIE)); if (!eu) { res.writeHead(401).end(); return; }
        const { M, catalogo, textos } = universos.compor(mu[1], eu.id);
        const js = mu[2] === 'cidade' ? `SystemCity.definir(${JSON.stringify({ ...M, catalogo: 'catalogo.js' })});\n` : mu[2] === 'catalogo' ? `window.CIDADE_SPECS = ${JSON.stringify(catalogo)};\n`
          : `(window.CIDADE_TEXTOS = window.CIDADE_TEXTOS || {})[${JSON.stringify(mu[3])}] = ${JSON.stringify(textos[mu[3]] || {})};\n`;
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(js); } }
    // a cidade guardada no banco, como JS para a página: só para quem pode vê-la
    { const mc = caminho.match(/^\/api\/cidades\/([a-z0-9-]+)\/(cidade|catalogo|textos-([a-z0-9-]+))\.js$/);
      if (mc && req.method === 'GET') { const eu = contas.deToken(lerCookie(req, contas.COOKIE)); if (!eu) { res.writeHead(401).end(); return; }
        const js = mc[2] === 'cidade' ? cidades.js(mc[1], eu.id) : mc[2] === 'catalogo' ? cidades.catalogoJs(mc[1], eu.id) : cidades.textosJs(mc[1], mc[3], eu.id);
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(js); } }
    if (req.method !== 'GET') {   // contra CSRF: escrita só com JSON e, se houver lista de origens, só delas
      if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new ErroUso('Use application/json.', 415);
      if (origens && req.headers.origin && !origens.includes(req.headers.origin)) throw new ErroUso('Origem não permitida.', 403);
    }
    const token = lerCookie(req, contas.COOKIE), eu = contas.deToken(token), r = `${req.method} ${caminho}`;
    // push no GitHub: regera a cidade (o corpo cru entra na assinatura, por isso é lido antes de qualquer parse)
    { const mg = r.match(/^POST \/api\/cidades\/([a-z0-9-]+)\/github$/); if (mg) {
      let bruto = ''; for await (const p of req) { bruto += p; if (bruto.length > 2e6) throw new ErroUso('Corpo grande demais.', 413); }
      const c = cidades.conferirWebhook(mg[1], req.headers['x-hub-signature-256'], bruto), evento = req.headers['x-github-event'];
      if (evento === 'ping') return json(res, 200, { ok: true });
      const p = JSON.parse(bruto); if (evento !== 'push' || p.ref !== `refs/heads/${(p.repository || {}).default_branch}`) return json(res, 202, { ignorado: true });
      json(res, 202, { regerando: true }); regerarEAvisar(c.slug, null, (p.head_commit || {}).id); return; } }
    if (r === 'POST /api/kiwify/webhook') { let bruto = ''; for await (const p of req) { bruto += p; if (bruto.length > 1e6) throw new ErroUso('Corpo grande demais.', 413); }
      return json(res, 200, assinaturas.webhook(new URL(req.url, 'http://x').searchParams.get('signature'), bruto)); }
    if (r === 'POST /api/stripe/webhook') { let bruto = ''; for await (const p of req) { bruto += p; if (bruto.length > 1e6) throw new ErroUso('Corpo grande demais.', 413); }
      return json(res, 200, cobranca.webhook(req.headers['stripe-signature'], bruto)); }
    if (r === 'POST /api/incidentes/webhook') return json(res, 201, incidentes.webhook(req.headers['x-systemcity-token'], await corpo(req)));   // alertas de fora: autentica pelo token, não pelo cookie

    const ip = ipDe(req);
    if (r === 'GET /api/provedores') return json(res, 200, provedoresLigados());
    { const mo = caminho.match(/^\/auth\/(google|microsoft)(\/volta)?$/); if (mo && req.method === 'GET') {
      limite.contar(`oauth:${ip}`, 30, 600e3);
      if (!mo[2]) { res.writeHead(302, { location: social.inicio(mo[1], origemDe(req)), 'cache-control': 'no-store' }); return res.end(); }
      const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      try { const { token: t } = await social.volta(mo[1], origemDe(req), q); res.writeHead(302, { location: '/equipes.html', 'set-cookie': cookie(t, contas.DIAS_SESSAO * 86400), 'cache-control': 'no-store' }); }
      catch (e) { res.writeHead(302, { location: `/entrar.html?erro=${encodeURIComponent(e.message)}` }); }
      return res.end(); } }
    if (r === 'POST /api/cadastro') { limite.contar(`cad:${ip}`, 10, 3600e3, 'Muitas contas criadas daqui.'); const { usuario, token: t } = contas.cadastrar(await corpo(req)); return json(res, 201, usuario, { 'set-cookie': cookie(t, contas.DIAS_SESSAO * 86400) }); }
    if (r === 'POST /api/entrar') { const dados = await corpo(req), quem = String(dados.email || '').trim().toLowerCase();
      limite.contar(`ent-ip:${ip}`, 30, 900e3, 'Muitas tentativas de login daqui.'); limite.contar(`ent:${quem}`, 8, 900e3, 'Muitas tentativas para esta conta.');
      const { usuario, token: t } = contas.entrar(dados); limite.zerar(`ent:${quem}`); return json(res, 200, usuario, { 'set-cookie': cookie(t, contas.DIAS_SESSAO * 86400) }); }
    if (r === 'POST /api/senha/esqueci') { limite.contar(`esq:${ip}`, 5, 3600e3, 'Muitos pedidos de senha daqui.');
      const { email } = await corpo(req), p = contas.pedirRedefinicao(email);
      if (p) { const link = `${origemDe(req)}/redefinir.html?t=${p.token}`;
        await enviarEmail({ para: p.usuario.email, assunto: 'Redefinir sua senha no SystemCity', texto: `Oi, ${p.usuario.nome}. Para criar uma senha nova, abra: ${link}\nO link vale 1 hora. Se não foi você, ignore este e-mail.`,
          html: `<p>Oi, ${p.usuario.nome.replace(/[<>&]/g, '')}.</p><p>Para criar uma senha nova, <a href="${link}">clique aqui</a>. O link vale 1 hora.</p><p>Se não foi você, ignore este e-mail.</p>` }); }
      return json(res, 200, { email: emailLigado() }); }   // a resposta é a mesma exista a conta ou não
    if (r === 'POST /api/senha/redefinir') { limite.contar(`red:${ip}`, 10, 3600e3); const d = await corpo(req), { usuario, token: t } = contas.redefinir(d.token, d.senha); return json(res, 200, usuario, { 'set-cookie': cookie(t, contas.DIAS_SESSAO * 86400) }); }
    if (r === 'POST /api/sair') { contas.sair(token); return json(res, 204, undefined, { 'set-cookie': cookie('', 0) }); }
    if (!eu) throw new ErroUso('Entre na sua conta.', 401);
    const u = eu.id, id = Number((caminho.match(/^\/api\/(?:salas|reunioes|atas|corridas|equipes)\/(\d+)/) || [])[1]);

    if (r === 'GET /api/eu') return json(res, 200, { ...eu, plano: planos.daPessoa(u), admin: (process.env.ADMINS || '').toLowerCase().split(',').map(x => x.trim()).includes(eu.email), githubConectado: cidades.githubConectado(u), ia: comoRoda(), ticketsUrl: process.env.TICKETS_NOVO_URL || null, tickets: process.env.SISTEMA_TICKETS || null });
    if (r === 'POST /api/cidade/roteiro') return json(res, 200, await assistente.roteiro(u, await corpo(req)));
    if (/^POST \/api\/(cidade\/(perguntar|roteiro)|cidades\/github|salas\/\d+\/atas|incidentes\/\d+\/resolver)$/.test(r)) limite.contar(`ia:${u}`, Number(process.env.IA_POR_HORA) || 60, 3600e3, 'Você chegou ao limite de pedidos ao Claude nesta hora.');   // a chave da Anthropic é sua: sem freio, uma pessoa gasta por todas
    if (r === 'POST /api/cidade/perguntar') { planos.podeUsarIA(u); planos.podePerguntar(u); }
    if (r === 'POST /api/cidade/perguntar') return json(res, 200, await assistente.responder(u, await corpo(req)));
    { const mx = caminho.match(/^\/api\/cidades\/([a-z0-9-]+)\/(instante|linha)$/); if (mx) {
      if (mx[2] === 'instante' && req.method === 'POST') return json(res, 200, replay.gravar(mx[1], u, (await corpo(req)).filas));
      if (mx[2] === 'linha' && req.method === 'GET') return json(res, 200, replay.linha(mx[1], u, url.searchParams.get('de'), url.searchParams.get('ate'))); } }
    { const mi = caminho.match(/^\/api\/cidades\/([a-z0-9-]+)\/incidentes$/); if (mi) {
      if (req.method === 'GET') return json(res, 200, incidentes.recentes(mi[1], u));
      if (req.method === 'POST') return json(res, 201, incidentes.declarar(mi[1], u, await corpo(req))); } }
    { const mr = caminho.match(/^\/api\/incidentes\/(\d+)\/resolver$/); if (mr && req.method === 'POST') return json(res, 200, await incidentes.resolver(+mr[1], u)); }
    { const mw = caminho.match(/^\/api\/cidades\/([a-z0-9-]+)\/(webhook|regerar)$/); if (mw) {
      if (mw[2] === 'webhook' && req.method === 'GET') return json(res, 200, { url: `${origemDe(req)}/api/cidades/${mw[1]}/github`, segredo: cidades.webhookDe(mw[1], u) });
      if (mw[2] === 'regerar' && req.method === 'POST') { limite.contar(`ia:${u}`, Number(process.env.IA_POR_HORA) || 60, 3600e3, 'Você chegou ao limite de pedidos ao Claude nesta hora.'); return json(res, 200, await regerarEAvisar(mw[1], u)); } } }
    { const ma = caminho.match(/^\/api\/cidades\/([a-z0-9-]+)\/auditoria(?:\/(\d+)\/achados\/(\d+)\/corrigir)?$/); if (ma) {
      if (req.method === 'GET' && !ma[2]) return json(res, 200, auditorias.ver(ma[1], u));
      if (req.method === 'POST' && !ma[2]) { planos.podeAuditar(u); planos.podeUsarIA(u); limite.contar(`ia:${u}`, Number(process.env.IA_POR_HORA) || 60, 3600e3, 'Você chegou ao limite de pedidos ao Claude nesta hora.'); return json(res, 202, auditorias.iniciar(ma[1], u)); }
      if (req.method === 'POST') return json(res, 201, await auditorias.corrigir(ma[1], u, +ma[2], +ma[3])); } }
    { const mh = caminho.match(/^\/api\/(cidades|universos)\/([a-z0-9-]+)\/historia$/); if (mh && req.method === 'GET') { limite.contar(`hist:${u}`, 20, 3600e3, 'Muitas consultas ao histórico nesta hora.');
      return json(res, 200, mh[1] === 'cidades' ? await historia.daCidade(mh[2], u) : await historia.doUniverso(mh[2], u)); } }
    if (r === 'POST /api/agentes') { limite.contar(`ia:${u}`, Number(process.env.IA_POR_HORA) || 60, 3600e3, 'Você chegou ao limite de pedidos ao Claude nesta hora.'); return json(res, 201, await agentes.criar(u, await corpo(req))); }
    { const mg2 = caminho.match(/^\/api\/cidades\/([a-z0-9-]+)\/agentes$/); if (mg2 && req.method === 'GET') return json(res, 200, agentes.daCidade(mg2[1], u)); }
    { const ma2 = caminho.match(/^\/api\/agentes\/(\d+)(?:\/(responder|parar|pr|descartar))?$/); if (ma2) { const aid = +ma2[1];
      if (!ma2[2] && req.method === 'GET') return json(res, 200, agentes.ver(aid, u));
      if (ma2[2] === 'responder' && req.method === 'POST') { limite.contar(`ia:${u}`, Number(process.env.IA_POR_HORA) || 60, 3600e3, 'Você chegou ao limite de pedidos ao Claude nesta hora.'); return json(res, 200, agentes.responder(aid, u, (await corpo(req)).texto)); }
      if (ma2[2] === 'parar' && req.method === 'POST') return json(res, 200, agentes.parar(aid, u));
      if (ma2[2] === 'descartar' && req.method === 'POST') return json(res, 200, agentes.descartar(aid, u, (await corpo(req)).caminho));
      if (ma2[2] === 'pr' && req.method === 'POST') return json(res, 201, await agentes.abrirPR(aid, u, await corpo(req))); } }
    // conexões com as contas de código (GitHub, Bitbucket, CodeCommit) e a lista dos repositórios de todas elas
    if (r === 'GET /api/conexoes') return json(res, 200, { conexoes: conexoes.listar(u), githubOauth: githubOauthLigado() });
    if (r === 'GET /api/conexoes/repos') { limite.contar(`repos:${u}`, 60, 3600e3); return json(res, 200, await conexoes.repositorios(u)); }
    { const mc = caminho.match(/^\/api\/conexoes\/(github|bitbucket|codecommit)$/); if (mc) {
      if (req.method === 'PUT') { limite.contar(`con:${u}`, 20, 3600e3); return json(res, 200, await conexoes.conectar(u, mc[1], await corpo(req), conferirConexao)); }
      if (req.method === 'DELETE') return json(res, 200, conexoes.desconectar(u, mc[1])); } }
    if (r === 'GET /conectar/github') { res.writeHead(302, { location: ghConexao.inicio(u, origemDe(req)), 'cache-control': 'no-store' }); return res.end(); }
    if (r === 'GET /conectar/github/volta') { const qs = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      try { await ghConexao.volta(u, origemDe(req), qs); res.writeHead(302, { location: '/cidades.html?conectado=github' }); } catch (e) { res.writeHead(302, { location: `/cidades.html?erro=${encodeURIComponent(e.message)}` }); } return res.end(); }
    if (r === 'GET /api/universos') return json(res, 200, universos.meus(u));
    if (r === 'POST /api/universos') return json(res, 201, universos.criar(u, await corpo(req)));
    { const mv = caminho.match(/^\/api\/universos\/([a-z0-9-]+)(?:\/(repos|religar))?(?:\/([a-z0-9-]+))?$/); if (mv) {
      if (!mv[2] && req.method === 'GET') return json(res, 200, universos.ver(mv[1], u));
      if (!mv[2] && req.method === 'DELETE') { universos.apagar(mv[1], u); return json(res, 204); }
      if (mv[2] === 'repos' && req.method === 'POST') { limite.contar(`ia:${u}`, Number(process.env.IA_POR_HORA) || 60, 3600e3, 'Você chegou ao limite de pedidos ao Claude nesta hora.'); planos.podeGerarCidade(u); planos.podeUsarIA(u); return json(res, 201, await universos.adicionarRepo(mv[1], u, await corpo(req))); }
      if (mv[2] === 'repos' && mv[3] && req.method === 'DELETE') { universos.tirarRepo(mv[1], u, mv[3]); return json(res, 204); }
      if (mv[2] === 'religar' && req.method === 'POST') return json(res, 200, { ligacoes: await universos.religar(mv[1], u) }); } }
    if (r === 'GET /api/cidades') return json(res, 200, { cidades: cidades.minhas(u), modelos: cidades.modelos() });
    { const mp = caminho.match(/^\/api\/equipes\/(\d+)\/(assinar|portal)$/); if (mp && req.method === 'POST') return json(res, 200, mp[2] === 'assinar' ? await cobranca.assinar(+mp[1], u, (await corpo(req)).plano, origemDe(req)) : await cobranca.portal(+mp[1], u, origemDe(req))); }
    if (r === 'GET /api/assinatura') return json(res, 200, { kiwify: kiwifyLigada(), minha: assinaturas.minha(eu.email), plano: planos.daPessoa(u), ...(kiwifyLigada() ? assinaturas.checkout() : {}) });
    if (r === 'GET /api/admin/custos') { exigeAdmin(eu); const dias = Math.min(365, Number(new URL(req.url, 'http://x').searchParams.get('dias')) || 30); return json(res, 200, { ...custos.relatorio(dias), assinaturas: assinaturas.todas() }); }
    if (r === 'GET /api/planos') return json(res, 200, { ligado: planos.ligado(), cobranca: cobrancaLigada(), kiwify: kiwifyLigada(), meu: planos.daPessoa(u), planos: Object.fromEntries(Object.entries(PLANOS).map(([k, v]) => [k, { ...v, pessoas: isFinite(v.pessoas) ? v.pessoas : null, cidadesGithubMes: isFinite(v.cidadesGithubMes) ? v.cidadesGithubMes : null, perguntasDia: isFinite(v.perguntasDia) ? v.perguntasDia : null }])) });
    if (r === 'POST /api/cidades/github') { planos.podeGerarCidade(u); planos.podeUsarIA(u); const c = await cidades.doGithub(u, await corpo(req)); if (process.env.AUDITAR_AO_GERAR !== '0') try { planos.podeAuditar(u); planos.podeUsarIA(u); auditorias.iniciar(c.slug, u); } catch {} return json(res, 201, c); }   // o projeto entrou: os agentes já começam a revisar
    if (r === 'POST /api/cidades/modelo') return json(res, 201, cidades.doModelo(u, await corpo(req)));
    if (r === 'POST /api/github') return json(res, 200, cidades.conectarGithub(u, (await corpo(req)).token));
    { const ms = caminho.match(/^\/api\/cidades\/([a-z0-9-]+)$/); if (ms) {
      if (req.method === 'GET') { const c = cidades.ver(ms[1], u); return json(res, 200, { ...c, catalogo: undefined, textos: undefined }); }
      if (req.method === 'DELETE') { cidades.apagar(ms[1], u); return json(res, 204); } } }
    if (r === 'PATCH /api/eu') return json(res, 200, contas.perfil(u, await corpo(req)));
    if (r === 'GET /api/usuarios/busca') return json(res, 200, contas.buscar(url.searchParams.get('q'), u));
    if (r === 'GET /api/equipes') return json(res, 200, equipes.minhas(u));
    if (r === 'POST /api/equipes') { const e = equipes.criar(u, await corpo(req)); avisarSala(e.sala); return json(res, 201, e); }
    if (req.method === 'GET' && /^\/api\/equipes\/\d+$/.test(caminho)) return json(res, 200, equipes.ver(id, u));
    if (req.method === 'PATCH' && /^\/api\/equipes\/\d+$/.test(caminho)) { const e = equipes.renomear(id, u, (await corpo(req)).nome); avisarEquipe(e); return json(res, 200, e); }
    if (req.method === 'DELETE' && /^\/api\/equipes\/\d+$/.test(caminho)) { for (const m of equipes.apagar(id, u)) rt.para(m, { t: 'equipe:saiu', equipe: id }); return json(res, 204); }
    if (req.method === 'POST' && /^\/api\/equipes\/\d+\/membros$/.test(caminho)) { planos.podeAdicionar(id); const { equipe, novo } = equipes.adicionar(id, u, await corpo(req)); avisarEquipe(equipe); avisarSala(equipe.sala); rt.para(novo.id, { t: 'equipe:entrou', equipe: { id: equipe.id, nome: equipe.nome } }); return json(res, 201, equipe); }
    { const mm = caminho.match(/^\/api\/equipes\/\d+\/membros\/(\d+)$/); if (mm && (req.method === 'DELETE' || req.method === 'PATCH')) {
      if (req.method === 'PATCH') { const e = equipes.papel(id, u, +mm[1], (await corpo(req)).papel); avisarEquipe(e); return json(res, 200, e); }
      const eq = equipes.ver(id, u); equipes.remover(id, u, +mm[1]); rt.para(+mm[1], { t: 'equipe:saiu', equipe: id }); avisarEquipe(eq); return json(res, 204); } }
    if (r === 'GET /api/pessoas') { const on = new Set(rt.online()); return json(res, 200, conversas.pessoas().map(p => ({ ...p, online: on.has(p.id) }))); }
    if (r === 'GET /api/salas') return json(res, 200, conversas.salas(u));
    if (r === 'POST /api/salas') { const sala = conversas.criarGrupo(u, await corpo(req)); avisarSala(sala); return json(res, 201, conversas.sala(sala, u)); }
    if (r === 'POST /api/diretas') { const { com } = await corpo(req), sala = conversas.direta(u, com); avisarSala(sala); return json(res, 200, conversas.sala(sala, u)); }
    if (req.method === 'GET' && /^\/api\/salas\/\d+\/mensagens$/.test(caminho)) return json(res, 200, conversas.mensagens(id, u, url.searchParams.get('antes')));
    if (req.method === 'POST' && /^\/api\/salas\/\d+\/mensagens$/.test(caminho)) { const m = conversas.enviar(id, u, (await corpo(req)).texto); rt.paraSala(id, { t: 'mensagem', mensagem: m }); return json(res, 201, m); }
    if (req.method === 'POST' && /^\/api\/salas\/\d+\/lida$/.test(caminho)) { conversas.marcarLida(id, u, (await corpo(req)).ate); return json(res, 204); }
    if (r === 'GET /api/reunioes') return json(res, 200, conversas.reunioes(u));
    if (r === 'POST /api/reunioes') { const rid = conversas.agendar(u, await corpo(req)); avisarReuniao(rid); return json(res, 201, conversas.reuniao(rid, u)); }
    if (req.method === 'POST' && /^\/api\/reunioes\/\d+\/resposta$/.test(caminho)) { conversas.responder(id, u, (await corpo(req)).resposta); avisarReuniao(id); return json(res, 204); }
    if (r === 'GET /api/corridas') return json(res, 200, corridas.lista());
    if (r === 'GET /api/grid/placar') return json(res, 200, corridas.placar(url.searchParams.get('temporada')));
    if (r === 'POST /api/corridas') { const c = corridas.criar(u, await corpo(req)); avisarSala(c.sala); return json(res, 201, c); }
    if (req.method === 'POST' && /^\/api\/corridas\/\d+\/entrar$/.test(caminho)) { const c = corridas.entrar(id, u); avisarSala(c.sala); return json(res, 200, c); }
    if (req.method === 'GET' && /^\/api\/salas\/\d+\/transcricao$/.test(caminho)) return json(res, 200, { falas: conversas.trechoSemAta(id, u), ligada: rt.transcrevendo(id), gerando: gerando.has(id) });
    if (req.method === 'GET' && /^\/api\/salas\/\d+\/atas$/.test(caminho)) return json(res, 200, conversas.atas(id, u));
    if (req.method === 'POST' && /^\/api\/salas\/\d+\/atas$/.test(caminho)) return json(res, 201, await novaAta(id, u, (await corpo(req)).bairros));
    if (req.method === 'GET' && /^\/api\/salas\/\d+\/atividades$/.test(caminho)) return json(res, 200, conversas.atividades(id, u));
    if (req.method === 'GET' && /^\/api\/atas\/\d+\/atividades$/.test(caminho)) return json(res, 200, conversas.atividadesDaAta(id, u));
    if (r === 'GET /api/obras') return json(res, 200, conversas.obras(u, url.searchParams.get('bairros') ? url.searchParams.get('bairros').split(',') : null));
    { const mt = caminho.match(/^\/api\/atividades\/(\d+)\/ticket$/); if (mt && req.method === 'POST') { const a = await tickets.abrir(+mt[1], u); rt.paraSala(a.sala, { t: 'atividade', atividade: a }); return json(res, 200, a); } }
    if (req.method === 'GET' && /^\/api\/equipes\/\d+\/tickets$/.test(caminho)) return json(res, 200, tickets.ver(id, u));
    if (req.method === 'PUT' && /^\/api\/equipes\/\d+\/tickets$/.test(caminho)) return json(res, 200, tickets.configurar(id, u, await corpo(req)));
    if (req.method === 'GET' && /^\/api\/salas\/\d+\/tickets$/.test(caminho)) return json(res, 200, { integrado: tickets.temIntegracao(id) });
    { const ma = caminho.match(/^\/api\/atividades\/(\d+)$/); if (ma && req.method === 'PATCH') { const a = conversas.marcar(+ma[1], u, await corpo(req)); rt.paraSala(a.sala, { t: 'atividade', atividade: a }); return json(res, 200, a); } }
    if (req.method === 'GET' && /^\/api\/atas\/\d+$/.test(caminho)) return json(res, 200, conversas.ata(id, u));
    if (req.method === 'GET' && /^\/api\/atas\/\d+\.md$/.test(caminho)) { const a = conversas.ata(id, u), nome = `${a.titulo.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'ata'}-${new Date(a.criada).toISOString().slice(0, 10)}.md`;
      res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="${nome}"`, 'cache-control': 'no-store' }); return res.end(a.markdown); }
    throw new ErroUso('Rota não encontrada.', 404);
  }
  // ata: as falas ainda sem ata viram um markdown de atividades, gerado pelo Claude local; todos da sala ficam sabendo
  async function novaAta(sala, u, bairros) {
    bairros = Array.isArray(bairros) ? bairros.slice(0, 20).map(b => ({ id: String(b.id || '').slice(0, 40), nome: String(b.nome || '').slice(0, 60), desc: String(b.desc || '').slice(0, 200) })).filter(b => b.id) : [];
    const falas = conversas.trechoSemAta(sala, u);
    if (!falas.length) throw new ErroUso('Ainda não há transcrição nova nesta sala. Ligue "Transcrever" numa chamada.');
    if (gerando.has(sala)) throw new ErroUso('Já estou gerando a ata desta sala. Espere um pouco.', 409);
    gerando.add(sala); rt.paraSala(sala, { t: 'ata:gerando', sala, gerando: true });
    try {
      const { sala: s, reuniao } = conversas.contexto(sala), nomes = [...new Set(falas.map(f => f.nome))];
      const titulo = reuniao ? reuniao.titulo : s.tipo === 'grupo' ? s.nome : `Conversa entre ${nomes.join(' e ')}`;
      const quando = new Date(falas[0].criada).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const markdown = await gerarAta(montarPedido({ titulo, quando, participantes: nomes, falas, tickets: process.env.SISTEMA_TICKETS || 'o sistema de tickets', bairros }));
      const aid = conversas.salvarAta(sala, u, { titulo, markdown, de: falas[0].id, ate: falas[falas.length - 1].id }), ata = conversas.ata(aid, u);
      const atividades = conversas.guardarAtividades(aid, sala, markdown, bairros.length ? bairros.map(b => b.id) : null);
      rt.paraSala(sala, { t: 'ata', ata: { ...ata, markdown: undefined } }); for (const a of atividades) rt.paraSala(sala, { t: 'atividade', atividade: a }); return { ...ata, atividades };
    } catch (e) { throw e instanceof ErroUso ? e : new ErroUso(e.message, 502); }
    finally { gerando.delete(sala); rt.paraSala(sala, { t: 'ata:gerando', sala, gerando: false }); }
  }
  // cada membro recebe a versão dele (com a própria resposta e as conversas não lidas)
  // regera e avisa quem vê a cidade do que mudou (quem estiver com ela aberta recebe o aviso na hora)
  async function regerarEAvisar(slug, u, commit) {
    try { const r = await cidades.regerar(slug, u); for (const m of r.membros) rt.para(m, { t: 'cidade:atualizada', slug, commit: commit ? String(commit).slice(0, 7) : null, mudancas: r.mudancas }); return r.mudancas; }
    catch (e) { console.error(`regerar ${slug}:`, e.message); if (u != null) throw e instanceof ErroUso ? e : new ErroUso(e.message, 502); }
  }
  const avisarEquipe = (e) => { for (const m of equipes.membrosDe(e.id)) rt.para(m, { t: 'equipe', equipe: e.id }); };
  const avisarSala = (sala) => { for (const m of conversas.membrosDe(sala)) rt.para(m, { t: 'sala', sala: conversas.sala(sala, m) }); };
  const avisarReuniao = (rid) => { for (const m of conversas.convidadosDe(rid)) rt.para(m, { t: 'reuniao', reuniao: conversas.reuniao(rid, m) }); };

  async function estatico(caminho, res) {
    let rel = decodeURIComponent(caminho).replace(/^\/+/, ''); if (!rel || rel.endsWith('/')) rel += 'index.html';
    const arq = resolve(RAIZ, rel);
    if (!arq.startsWith(RAIZ + sep) || PROIBIDO.test(rel)) { res.writeHead(404).end(); return; }
    try { if (!(await stat(arq)).isFile()) throw 0; } catch { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TIPOS[extname(arq)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(await readFile(arq));
  }

  return { servidor, db, auditorias, custos, fechar: () => new Promise(ok => { clearInterval(limpeza); corridas.fechar(); replay.fechar(); limite.fechar(); rt.fechar(); servidor.close(() => { db.close(); ok(); }); }) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // com dados/cert/ (gerado por certificado.mjs) o servidor sobe em HTTPS: é o que libera câmera e microfone para quem acessa pela rede
  const porta = Number(process.env.PORTA) || 4400, origens = process.env.ORIGENS ? process.env.ORIGENS.split(',') : null, cert = join(RAIZ, 'servidor/dados/cert');
  const tls = process.env.HTTPS !== '0' && existsSync(join(cert, 'cert.pem')) ? { cert: readFileSync(join(cert, 'cert.pem')), key: readFileSync(join(cert, 'chave.pem')) } : null;
  const { servidor } = criarServidor({ banco: resolve(process.env.BANCO || join(RAIZ, 'servidor/dados/encontros.db')), origens, seguro: !!tls || process.env.SEGURO === '1', tls });
  // em HTTPS, a mesma porta também atende quem digitou http://: o primeiro byte diz se é TLS (0x16); se não for, redireciona
  const entrada = !tls ? servidor : net.createServer((sock) => sock.once('data', (buf) => { sock.pause(); sock.unshift(buf);
    (buf[0] === 0x16 ? servidor : redirecionar).emit('connection', sock); process.nextTick(() => sock.resume()); }));
  const redirecionar = http.createServer((req, res) => { res.writeHead(301, { location: `https://${(req.headers.host || `localhost:${porta}`)}${req.url}` }).end(); });
  entrada.listen(porta, () => {
    const proto = tls ? 'https' : 'http', ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`SystemCity em ${proto}://localhost:${porta}${ips.map(ip => `\n  na rede: ${proto}://${ip}:${porta}`).join('')}`);
    if (!tls && ips.length) console.log('  (sem HTTPS, quem entra pela rede não consegue usar câmera e microfone: rode  node certificado.mjs  e reinicie)');
  });
}
