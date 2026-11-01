// SystemCity — conectores de dados ao vivo. Cada conector traz eventos de fora (uma API, um stream, o bridge de MCP)
// e solta na cidade um operário por evento. Com algum conector ligado, a simulação aleatória para: o tráfego passa a ser o real.
//
// Formato de evento que a cidade entende:  { bairro: 'pedidos', tipo: 'pd-t-cartao' }   (tipo é opcional)
//
// Tipos de conector (em SystemCity.definir({ conectores: [...] })):
//   { tipo: 'http', url, cada: 5000, mapa: (json) => [eventos] }   consulta a URL de tempos em tempos
//   { tipo: 'sse',  url, mapa: (msg) => [eventos] }                stream Server-Sent Events (é o que o bridge de MCP expõe)
//   { tipo: 'ws',   url, mapa: (msg) => [eventos] }                WebSocket
// `mapa` é opcional: sem ele, a resposta já deve ser um evento ou uma lista de eventos.
(() => {
  'use strict';
  const C = window.CID, M = window.CIDADE_MAPA; if (!C || !M || !C.api) return;
  const daUrl = (location.search.match(/[?&]aovivo=([^&]+)/) || [])[1];   // atalho: ?aovivo=http://localhost:4300/eventos liga um stream sem mexer na cidade
  const ativos = [...(M.conectores || []), ...(daUrl ? [{ tipo: 'sse', url: decodeURIComponent(daUrl) }] : [])].filter(c => c && c.url && c.ligado !== false);
  if (!ativos.length) return;

  const lista = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const soltar = (c, dado) => { let evs; try { evs = lista(c.mapa ? c.mapa(dado) : dado); } catch (e) { console.warn('SystemCity: mapa do conector falhou', c.url, e); return; }
    for (const ev of evs) if (ev && ev.bairro) C.api.soltar(ev.bairro, ev.tipo); };
  const ler = (txt) => { try { return JSON.parse(txt); } catch { return null; } };

  for (const c of ativos) {
    if (c.tipo === 'sse') { const es = new EventSource(c.url); es.onmessage = (m) => soltar(c, ler(m.data)); es.onerror = () => console.warn('SystemCity: stream caiu, o navegador tenta de novo', c.url); }
    else if (c.tipo === 'ws') { const abrir = () => { const ws = new WebSocket(c.url); ws.onmessage = (m) => soltar(c, ler(m.data)); ws.onclose = () => setTimeout(abrir, 3000); }; abrir(); }
    else { const buscar = () => fetch(c.url, { headers: c.headers || {} }).then(r => r.json()).then(j => soltar(c, j)).catch(e => console.warn('SystemCity: conector http falhou', c.url, e.message));
      buscar(); setInterval(buscar, c.cada || 5000); }
  }
  const selo = document.getElementById('selo'); if (selo) selo.textContent = 'dados ao vivo';
})();
