// Contas e sessões: senha com scrypt (sal por usuário) e sessão por token aleatório num cookie httpOnly.
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { nickDe } from './db.mjs';

const DIAS_SESSAO = 30, COOKIE = 'sc_sessao', NICK = /^[a-z0-9_.]{3,20}$/;

function hashSenha(senha) { const sal = randomBytes(16); return `${sal.toString('hex')}:${scryptSync(senha, sal, 64).toString('hex')}`; }
function confere(senha, guardado) { if (!guardado.includes(':')) return false;   // conta só do Google/Microsoft: ainda sem senha
  const [sal, h] = guardado.split(':'), calc = scryptSync(senha, Buffer.from(sal, 'hex'), 64);
  return timingSafeEqual(calc, Buffer.from(h, 'hex')); }

export class ErroUso extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

export function contas(db) {
  const porEmail = db.prepare('SELECT * FROM usuarios WHERE email = ?'), porNick = db.prepare('SELECT * FROM usuarios WHERE nick = ?'), porId = db.prepare('SELECT id, email, nome, nick FROM usuarios WHERE id = ?');
  const criar = db.prepare('INSERT INTO usuarios (email, nome, nick, hash, criado) VALUES (?, ?, ?, ?, ?)');
  const buscar = db.prepare("SELECT id, nome, nick FROM usuarios WHERE nick LIKE ? ESCAPE '\\' OR lower(nome) LIKE ? ESCAPE '\\' ORDER BY nick = ? DESC, nick LIMIT 8");
  const perfil = db.prepare('UPDATE usuarios SET nome = ?, nick = ? WHERE id = ?');
  const nickLivre = (base) => { let n = base, k = 1; while (porNick.get(n)) n = `${base.slice(0, 17)}${++k}`; return n; };
  const validarNick = (nick, meu) => { nick = String(nick || '').trim().toLowerCase().replace(/^@/, '');
    if (!NICK.test(nick)) throw new ErroUso('O nick precisa ter de 3 a 20 caracteres: letras minúsculas, números, ponto ou sublinhado.');
    const dono = porNick.get(nick); if (dono && dono.id !== meu) throw new ErroUso(`O nick @${nick} já é de outra pessoa.`, 409); return nick; };
  const novaSessao = db.prepare('INSERT INTO sessoes (token, usuario, expira) VALUES (?, ?, ?)');
  const sessao = db.prepare('SELECT u.id, u.email, u.nome, u.nick FROM sessoes s JOIN usuarios u ON u.id = s.usuario WHERE s.token = ? AND s.expira > ?');
  const apagar = db.prepare('DELETE FROM sessoes WHERE token = ?'), limpar = db.prepare('DELETE FROM sessoes WHERE expira <= ?');

  const novaRedef = db.prepare('INSERT INTO redefinicoes (hash, usuario, expira) VALUES (?, ?, ?)'), redef = db.prepare('SELECT * FROM redefinicoes WHERE hash = ?');
  const usarRedef = db.prepare('UPDATE redefinicoes SET usada = ? WHERE hash = ?'), trocarSenha = db.prepare('UPDATE usuarios SET hash = ? WHERE id = ?'), derrubarSessoes = db.prepare('DELETE FROM sessoes WHERE usuario = ?');
  const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
  const abrirSessao = (usuario) => { const token = randomBytes(32).toString('base64url'); novaSessao.run(token, usuario, Date.now() + DIAS_SESSAO * 864e5); return token; };

  return {
    COOKIE, DIAS_SESSAO,
    // nick é opcional aqui: sem ele, sai um a partir do e-mail (a tela de cadastro sempre pede um)
    cadastrar({ email, nome, senha, nick }) {
      email = String(email || '').trim().toLowerCase(); nome = String(nome || '').trim(); senha = String(senha || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErroUso('E-mail inválido.');
      if (nome.length < 2 || nome.length > 60) throw new ErroUso('O nome precisa ter entre 2 e 60 letras.');
      if (senha.length < 8) throw new ErroUso('A senha precisa ter pelo menos 8 caracteres.');
      if (porEmail.get(email)) throw new ErroUso('Já existe uma conta com esse e-mail.', 409);
      nick = nick ? validarNick(nick) : nickLivre(nickDe(email));
      const { lastInsertRowid } = criar.run(email, nome, nick, hashSenha(senha), Date.now());
      return { usuario: porId.get(Number(lastInsertRowid)), token: abrirSessao(Number(lastInsertRowid)) };
    },
    entrar({ email, senha }) {   // entra com e-mail ou nick
      const id = String(email || '').trim().toLowerCase(), u = id.includes('@') && !id.startsWith('@') ? porEmail.get(id) : porNick.get(id.replace(/^@/, ''));
      if (!u || !confere(String(senha || ''), u.hash)) throw new ErroUso('E-mail, nick ou senha incorretos.', 401);
      return { usuario: porId.get(u.id), token: abrirSessao(u.id) };
    },
    // entrar pelo Google ou Microsoft: o e-mail já veio confirmado pelo provedor; sem conta, cria uma sem senha (dá para criar uma pelo "esqueci a senha")
    pelaConta({ email, nome }) {
      let u = porEmail.get(email);
      if (!u) { const { lastInsertRowid } = criar.run(email, String(nome).trim().slice(0, 60).padEnd(2, '.'), nickLivre(nickDe(email)), 'externo', Date.now()); u = { id: Number(lastInsertRowid) }; }
      return { usuario: porId.get(u.id), token: abrirSessao(u.id) };
    },
    sair(token) { if (token) apagar.run(token); },
    deToken(token) { if (!token) return null; return sessao.get(token, Date.now()) || null; },
    limparVencidas() { limpar.run(Date.now()); },
    usuario: (id) => porId.get(id),
    // redefinição de senha: devolve o token (para o e-mail ou para o admin) ou null se a conta não existe — quem pediu nunca fica sabendo
    pedirRedefinicao(email) { const u = porEmail.get(String(email || '').trim().toLowerCase()); if (!u) return null;
      const token = randomBytes(32).toString('base64url'); novaRedef.run(hashToken(token), u.id, Date.now() + 3600e3); return { token, usuario: porId.get(u.id) }; },
    redefinir(token, senha) { senha = String(senha || ''); if (senha.length < 8) throw new ErroUso('A senha precisa ter pelo menos 8 caracteres.');
      const r = redef.get(hashToken(token)); if (!r || r.usada || r.expira < Date.now()) throw new ErroUso('Este link expirou ou já foi usado. Peça outro.', 410);
      usarRedef.run(Date.now(), r.hash); trocarSenha.run(hashSenha(senha), r.usuario); derrubarSessoes.run(r.usuario);   // senha nova derruba as sessões antigas
      return { usuario: porId.get(r.usuario), token: abrirSessao(r.usuario) }; },
    porNick: (nick) => { const u = porNick.get(String(nick || '').trim().toLowerCase().replace(/^@/, '')); return u ? porId.get(u.id) : null; },
    buscar(q, eu) { q = String(q || '').trim().toLowerCase().replace(/^@/, ''); if (q.length < 1) return [];
      const like = q.replace(/[\\%_]/g, '\\$&') + '%'; return buscar.all(like, '%' + like, q).filter(u => u.id !== eu); },
    perfil(id, { nome, nick }) { nome = String(nome || '').trim(); if (nome.length < 2 || nome.length > 60) throw new ErroUso('O nome precisa ter entre 2 e 60 letras.');
      perfil.run(nome, validarNick(nick, id), id); return porId.get(id); },
  };
}

export function lerCookie(req, nome) {
  for (const parte of (req.headers.cookie || '').split(';')) { const [k, ...v] = parte.trim().split('='); if (k === nome) return decodeURIComponent(v.join('=')); }
  return null;
}
