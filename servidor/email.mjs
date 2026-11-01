// E-mail transacional pelo Resend (https://resend.com). Sem RESEND_API_KEY e EMAIL_DE, não envia: quem chama decide o que fazer.
export const emailLigado = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_DE);

export async function enviarEmail({ para, assunto, html, texto }) {
  if (!emailLigado()) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_DE, to: [para], subject: assunto, html, text: texto }) });
  if (!r.ok) { console.error('Resend recusou o e-mail:', r.status, (await r.text()).slice(0, 200)); return false; }
  return true;
}
