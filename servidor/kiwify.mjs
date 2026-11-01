// Cobrança pela Kiwify: o plano Pro (R$ 29,90 por mês) é vendido como assinatura na Kiwify, e o webhook dela liga e desliga o plano.
// A assinatura é casada pelo e-mail do comprador: quem compra com o e-mail da conta do SystemCity vira Pro na hora
// (e quem compra antes de criar a conta vira Pro quando criar, com o mesmo e-mail).
//   KIWIFY_TOKEN     o token do webhook (Kiwify → Apps → Webhooks); assina o corpo com HMAC-SHA1, enviado em ?signature=
//   KIWIFY_CHECKOUT  o link de pagamento do produto (https://pay.kiwify.com.br/…)
// Webhook na Kiwify: <origem>/api/kiwify/webhook, com compra aprovada, reembolso, chargeback e os três eventos de assinatura.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErroUso } from './contas.mjs';

const FOLGA = 3 * 864e5;   // dias de tolerância depois da data da próxima cobrança, para o pagamento cair
export const kiwifyLigada = () => !!(process.env.KIWIFY_TOKEN && process.env.KIWIFY_CHECKOUT);

export function conferirAssinaturaKiwify(assinatura, bruto, token = process.env.KIWIFY_TOKEN) {
  if (!token) throw new ErroUso('A Kiwify não está ligada neste servidor.', 404);
  const esperado = createHmac('sha1', token).update(bruto).digest(), veio = Buffer.from(String(assinatura || ''), 'hex');
  if (veio.length !== esperado.length || !timingSafeEqual(veio, esperado)) throw new ErroUso('Assinatura da Kiwify inválida.', 401);
}

export function kiwify(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS assinaturas (email TEXT PRIMARY KEY, plano TEXT NOT NULL, status TEXT NOT NULL, ate INTEGER NOT NULL,
    assinatura TEXT, pedido TEXT, evento TEXT, atualizada INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS kiwify_eventos (id INTEGER PRIMARY KEY, quando INTEGER NOT NULL, tipo TEXT, email TEXT, pedido TEXT, corpo TEXT);`);
  const q = {
    ver: db.prepare('SELECT * FROM assinaturas WHERE email = ?'),
    gravar: db.prepare(`INSERT INTO assinaturas (email, plano, status, ate, assinatura, pedido, evento, atualizada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (email) DO UPDATE SET plano = excluded.plano, status = excluded.status, ate = excluded.ate, assinatura = coalesce(excluded.assinatura, assinatura),
      pedido = coalesce(excluded.pedido, pedido), evento = excluded.evento, atualizada = excluded.atualizada`),
    log: db.prepare('INSERT INTO kiwify_eventos (quando, tipo, email, pedido, corpo) VALUES (?, ?, ?, ?, ?)'),
    todas: db.prepare('SELECT a.*, u.nome FROM assinaturas a LEFT JOIN usuarios u ON u.email = a.email ORDER BY a.atualizada DESC LIMIT 200'),
  };
  const data = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
  return {
    webhook(assinatura, bruto) {
      conferirAssinaturaKiwify(assinatura, bruto);
      const ev = JSON.parse(bruto), tipo = ev.webhook_event_type || ev.order_status || 'desconhecido', cli = ev.Customer || ev.customer || {}, sub = ev.Subscription || ev.subscription || {};
      const email = String(cli.email || ev.email || '').trim().toLowerCase(), pedido = ev.order_id || null, idSub = ev.subscription_id || sub.id || null, agora = Date.now();
      q.log.run(agora, tipo, email || null, pedido, bruto.slice(0, 20000));   // guarda tudo: a Kiwify não tem sandbox, e o histórico ajuda a conferir
      if (!email) return { ignorado: tipo, motivo: 'sem e-mail' };
      const atual = q.ver.get(email), proxima = data(sub.next_payment), acesso = data((ev.customer_access || {}).access_until);
      let status, ate;
      if (tipo === 'order_approved' || tipo === 'subscription_renewed') { status = 'ativa'; ate = (proxima || agora + 30 * 864e5) + FOLGA; }
      else if (tipo === 'subscription_late') { status = 'atrasada'; ate = Math.max(atual ? atual.ate : 0, agora + FOLGA); }
      else if (tipo === 'subscription_canceled') { status = 'cancelada'; ate = acesso || proxima || (atual ? atual.ate : agora); }   // vale até o fim do período pago
      else if (tipo === 'order_refunded' || tipo === 'chargeback') { status = tipo === 'chargeback' ? 'chargeback' : 'reembolsada'; ate = agora; }
      else return { ignorado: tipo };
      q.gravar.run(email, 'pro', status, ate, idSub, pedido, tipo, agora);
      return { email, status, ate };
    },
    // o plano que a assinatura dá a esse e-mail agora (null se nenhum)
    planoDe(email) { const a = email && q.ver.get(String(email).toLowerCase()); return a && a.ate > Date.now() ? a.plano : null; },
    minha(email) { const a = email && q.ver.get(String(email).toLowerCase()); return a ? { plano: a.plano, status: a.status, ate: a.ate, ativa: a.ate > Date.now() } : null; },
    checkout() { if (!kiwifyLigada()) throw new ErroUso('A assinatura ainda não está à venda neste servidor.', 404); return { url: process.env.KIWIFY_CHECKOUT }; },
    todas: () => q.todas.all(),
  };
}
