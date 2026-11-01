// SystemCity — o que as páginas do site têm em comum: falar com a API, saber quem está logado, cores e avisos.
window.SC = (() => {
  async function api(metodo, caminho, corpo) {
    const r = await fetch(caminho, { method: metodo, credentials: 'same-origin', headers: metodo === 'GET' ? {} : { 'content-type': 'application/json' }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo || {}) });
    const txt = await r.text(), dado = txt ? JSON.parse(txt) : null;
    if (!r.ok) { const e = new Error((dado && dado.erro) || `Erro ${r.status}`); e.status = r.status; throw e; }
    return dado;
  }
  // null = não está logado · undefined = não há servidor (página aberta como arquivo estático)
  async function eu() { try { return await api('GET', '/api/eu'); } catch (e) { return e.status === 401 ? null : undefined; } }
  const CORES = ['#37e6ff', '#ff8a3c', '#5fd38d', '#f472b6', '#a78bfa', '#ffd24a', '#4fd1c5', '#3fa9f5'];
  const cor = (id) => CORES[Math.abs(Number(id) || 0) % CORES.length];
  const iniciais = (nome) => String(nome || '?').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function avisar(texto) { let el = document.querySelector('.aviso'); if (!el) { el = document.createElement('div'); el.className = 'aviso'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = texto; el.classList.add('mostra'); clearTimeout(el.t); el.t = setTimeout(() => el.classList.remove('mostra'), 2600); }
  return { api, eu, cor, iniciais, esc, avisar };
})();
