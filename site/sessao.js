// SystemCity — o que as páginas do site têm em comum: falar com a API, saber quem está logado, cores e avisos.
window.SC = (() => {
  async function api(metodo, caminho, corpo) {
    const r = await fetch(caminho, { method: metodo, credentials: 'same-origin', headers: metodo === 'GET' ? {} : { 'content-type': 'application/json' }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo || {}) });
    const txt = await r.text(), dado = txt ? JSON.parse(txt) : null;
    if (!r.ok) { const e = new Error((dado && dado.erro) || `Erro ${r.status}`); e.status = r.status; throw e; }
    return dado;
  }
  // null = não está logado · undefined = não há servidor (página aberta como arquivo estático)
  async function eu() { try { const x = await api('GET', '/api/eu'); acesso(x); return x; } catch (e) { return e.status === 401 ? null : undefined; } }
  // edição Cloud: teste do Pro em andamento mostra quanto falta; acabou sem pagamento, leva para os planos
  function acesso(x) {
    const a = x && x.acesso; if (!a) return; const aqui = location.pathname;
    if (a.estado === 'bloqueado' && !/\/(precos|entrar|redefinir)\.html$/.test(aqui)) { location.replace('/precos.html?teste=fim'); return; }
    if (a.estado !== 'teste' || document.getElementById('faixa-teste')) return;
    const falta = Math.max(0, a.ate - Date.now()), d = Math.ceil(falta / 864e5), h = Math.ceil(falta / 36e5);
    const el = document.createElement('a'); el.id = 'faixa-teste'; el.href = '/precos.html';
    el.innerHTML = `Teste grátis do Pro: ${d > 1 ? `faltam ${d} dias` : `faltam ${h} h`} · <b>Assinar</b>`;
    Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '14px', transform: 'translateX(-50%)', zIndex: 60, background: 'rgba(8,16,30,.92)', border: '1px solid rgba(55,230,255,.45)',
      color: '#cfe9ff', padding: '8px 14px', borderRadius: '999px', font: '500 13px system-ui, sans-serif', textDecoration: 'none', whiteSpace: 'nowrap' });
    document.body.appendChild(el);
  }
  const CORES = ['#37e6ff', '#ff8a3c', '#5fd38d', '#f472b6', '#a78bfa', '#ffd24a', '#4fd1c5', '#3fa9f5'];
  const cor = (id) => CORES[Math.abs(Number(id) || 0) % CORES.length];
  const iniciais = (nome) => String(nome || '?').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function avisar(texto) { let el = document.querySelector('.aviso'); if (!el) { el = document.createElement('div'); el.className = 'aviso'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = texto; el.classList.add('mostra'); clearTimeout(el.t); el.t = setTimeout(() => el.classList.remove('mostra'), 2600); }
  return { api, eu, cor, iniciais, esc, avisar, acesso };
})();
