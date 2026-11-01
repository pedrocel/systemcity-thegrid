// Cobrança pelo Stripe: o dono ou um admin assina o plano da equipe no Checkout do Stripe, e o webhook muda o plano quando o pagamento entra
// (e volta para o grátis quando a assinatura acaba). Sem as chaves, nada disso aparece e o plano muda só pela linha de comando.
//   STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · STRIPE_PRECO_TIME · STRIPE_PRECO_EMPRESA (ids price_… dos preços mensais)
// No Stripe, o webhook aponta para <origem>/api/stripe/webhook com os eventos checkout.session.completed e customer.subscription.deleted.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErroUso } from './contas.mjs';

const precoDe = (plano) => process.env[`STRIPE_PRECO_${plano.toUpperCase()}`];
export const cobrancaLigada = () => !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && precoDe('time'));

// a assinatura do Stripe: "t=<tempo>,v1=<hmac>" sobre "<tempo>.<corpo>", com tolerância de 5 minutos
export function conferirAssinatura(cabecalho, corpo, segredo, agora = Date.now()) {
  const partes = Object.fromEntries(String(cabecalho || '').split(',').map(p => p.split('=')).filter(p => p.length === 2)), t = Number(partes.t);
  const esperado = createHmac('sha256', segredo).update(`${partes.t}.${corpo}`).digest();
  const veio = Buffer.from(String(partes.v1 || ''), 'hex');
  if (!t || Math.abs(agora / 1000 - t) > 300 || veio.length !== esperado.length || !timingSafeEqual(veio, esperado)) throw new ErroUso('Assinatura do Stripe inválida.', 401);
}

export function cobranca(db, { equipes, buscar = fetch }) {
  const q = {
    gravar: db.prepare('UPDATE equipes SET plano = ?, stripe = ? WHERE id = ?'), stripe: db.prepare('SELECT stripe FROM equipes WHERE id = ?'),
    daAssinatura: db.prepare("SELECT id FROM equipes WHERE json_extract(stripe, '$.assinatura') = ?"),
  };
  const stripe = async (caminho, campos) => {
    const r = await buscar(`https://api.stripe.com/v1/${caminho}`, { method: 'POST', headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(campos) });
    const j = await r.json(); if (!r.ok) throw new ErroUso(`O Stripe recusou: ${(j.error || {}).message || r.status}`, 502); return j;
  };
  const admin = (e, u) => { const eq = equipes.ver(e, u); if (!['dono', 'admin'].includes(eq.meuPapel)) throw new ErroUso('Só o dono ou um admin da equipe cuida do plano.', 403); return eq; };
  return {
    async assinar(e, u, plano, origem) {
      if (!cobrancaLigada()) throw new ErroUso('A cobrança não está ligada neste servidor.', 404);
      const eq = admin(e, u), preco = precoDe(String(plano)); if (!preco) throw new ErroUso('Plano desconhecido.');
      const s = await stripe('checkout/sessions', { mode: 'subscription', 'line_items[0][price]': preco, 'line_items[0][quantity]': String(plano === 'time' ? Math.max(1, eq.membros.length) : 1),   // o Time é por pessoa
        client_reference_id: String(e),
        'metadata[equipe]': String(e), 'metadata[plano]': plano, 'subscription_data[metadata][equipe]': String(e), success_url: `${origem}/equipes.html?assinou=${e}`, cancel_url: `${origem}/precos.html` });
      return { url: s.url };
    },
    async portal(e, u, origem) {
      admin(e, u); const st = JSON.parse((q.stripe.get(e) || {}).stripe || 'null'); if (!st || !st.cliente) throw new ErroUso('Esta equipe ainda não tem assinatura.', 404);
      return { url: (await stripe('billing_portal/sessions', { customer: st.cliente, return_url: `${origem}/equipes.html` })).url };
    },
    webhook(cabecalho, bruto) {
      conferirAssinatura(cabecalho, bruto, process.env.STRIPE_WEBHOOK_SECRET); const ev = JSON.parse(bruto), o = (ev.data || {}).object || {};
      if (ev.type === 'checkout.session.completed') { const e = Number((o.metadata || {}).equipe || o.client_reference_id), plano = (o.metadata || {}).plano;
        if (e && ['time', 'empresa'].includes(plano)) q.gravar.run(plano, JSON.stringify({ cliente: o.customer, assinatura: o.subscription }), e); return { equipe: e, plano }; }
      if (ev.type === 'customer.subscription.deleted') { const eq = q.daAssinatura.get(o.id); if (eq) { const st = JSON.parse(q.stripe.get(eq.id).stripe); q.gravar.run('gratis', JSON.stringify({ cliente: st.cliente }), eq.id); } return { equipe: eq && eq.id, plano: 'gratis' }; }
      return { ignorado: ev.type };
    },
  };
}
