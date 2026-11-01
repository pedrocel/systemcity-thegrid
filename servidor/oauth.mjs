// Entrar com Google ou Microsoft (OpenID Connect, fluxo de código com PKCE). Cada provedor só aparece com as chaves no ambiente:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET · MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (MICROSOFT_TENANT, padrão: common)
// O retorno cadastrado no provedor é <origem>/auth/<provedor>/volta. A conta é casada pelo e-mail: quem já tem conta com senha entra nela.
import { randomBytes, createHash } from 'node:crypto';
import { ErroUso } from './contas.mjs';

const PROVEDORES = {
  google: { nome: 'Google', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', info: 'https://openidconnect.googleapis.com/v1/userinfo' },
  microsoft: { nome: 'Microsoft', get auth() { return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'common'}/oauth2/v2.0/authorize`; },
    get token() { return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'common'}/oauth2/v2.0/token`; }, info: 'https://graph.microsoft.com/oidc/userinfo' },
};
const chaves = (p) => ({ id: process.env[`${p.toUpperCase()}_CLIENT_ID`], segredo: process.env[`${p.toUpperCase()}_CLIENT_SECRET`] });
export const provedoresLigados = () => Object.keys(PROVEDORES).filter(p => chaves(p).id && chaves(p).segredo).map(p => ({ id: p, nome: PROVEDORES[p].nome }));

export function oauth({ contas, buscar = fetch }) {
  const pendentes = new Map();   // state → { verificador, provedor, expira }; vive 10 minutos
  const limpar = () => { const agora = Date.now(); for (const [k, v] of pendentes) if (v.expira < agora) pendentes.delete(k); };
  const ligado = (p) => { if (!PROVEDORES[p] || !chaves(p).id) throw new ErroUso('Esse jeito de entrar não está ligado neste servidor.', 404); return PROVEDORES[p]; };
  return {
    inicio(p, origem) {
      const prov = ligado(p); limpar(); const state = randomBytes(24).toString('base64url'), verificador = randomBytes(32).toString('base64url');
      pendentes.set(state, { verificador, provedor: p, expira: Date.now() + 600e3 });
      const q = new URLSearchParams({ client_id: chaves(p).id, response_type: 'code', redirect_uri: `${origem}/auth/${p}/volta`, scope: 'openid email profile', state,
        code_challenge: createHash('sha256').update(verificador).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' });
      return `${prov.auth}?${q}`;
    },
    async volta(p, origem, { code, state, error }) {
      const prov = ligado(p); if (error) throw new ErroUso(`O ${prov.nome} não autorizou a entrada.`, 401);
      const pend = pendentes.get(state); pendentes.delete(state);
      if (!pend || pend.provedor !== p || pend.expira < Date.now()) throw new ErroUso('O pedido de entrada expirou. Tente de novo.', 401);
      const r = await buscar(prov.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${origem}/auth/${p}/volta`, client_id: chaves(p).id, client_secret: chaves(p).segredo, code_verifier: pend.verificador }) });
      const tk = await r.json().catch(() => ({})); if (!r.ok || !tk.access_token) throw new ErroUso(`O ${prov.nome} recusou a entrada.`, 401);
      const info = await (await buscar(prov.info, { headers: { authorization: `Bearer ${tk.access_token}` } })).json().catch(() => ({}));
      const email = String(info.email || info.preferred_username || '').toLowerCase();
      if (!email.includes('@') || info.email_verified === false) throw new ErroUso(`O ${prov.nome} não confirmou um e-mail para essa conta.`, 401);
      return contas.pelaConta({ email, nome: info.name || email.split('@')[0] });
    },
  };
}

// Conectar o GitHub pela conta (OAuth App), em vez de colar um token. Só com GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET no ambiente.
// No GitHub (Settings → Developer settings → OAuth Apps), o callback é <origem>/conectar/github/volta.
export const githubOauthLigado = () => !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
export function conectarGithub({ conexoes, buscar = fetch }) {
  const pendentes = new Map();
  return {
    inicio(u, origem) {
      if (!githubOauthLigado()) throw new ErroUso('A conexão pelo GitHub não está ligada neste servidor. Use um token.', 404);
      for (const [k, v] of pendentes) if (v.expira < Date.now()) pendentes.delete(k);
      const state = randomBytes(24).toString('base64url'); pendentes.set(state, { u, expira: Date.now() + 600e3 });
      return `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: `${origem}/conectar/github/volta`, scope: 'repo read:org', state })}`;
    },
    async volta(u, origem, { code, state }) {
      const p = pendentes.get(state); pendentes.delete(state); if (!p || p.u !== u || p.expira < Date.now()) throw new ErroUso('O pedido de conexão expirou. Tente de novo.', 401);
      const r = await buscar('https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${origem}/conectar/github/volta` }) });
      const j = await r.json().catch(() => ({})); if (!j.access_token) throw new ErroUso('O GitHub não autorizou a conexão.', 401);
      return conexoes.conectar(u, 'github', { token: j.access_token });
    },
  };
}
