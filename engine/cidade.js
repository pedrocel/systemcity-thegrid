// SystemCity — carregador. Escolhe a cidade pela URL (?cidade=<pasta>, padrão "exemplo"), carrega cities/<pasta>/cidade.js
// e completa o mapa com valores padrão antes de os motores rodarem. A cidade se declara com SystemCity.definir({...}).
(() => {
  // ?cidade=<pasta> abre uma cidade em cities/; ?c=<slug> abre uma cidade guardada no servidor (gerada do GitHub ou de um modelo)
  const doBanco = (location.search.match(/[?&]c=([a-z0-9-]+)/) || [])[1], universo = (location.search.match(/[?&]u=([a-z0-9-]+)/) || [])[1];
  const nome = (location.search.match(/[?&]cidade=([\w-]+)/) || [])[1] || window.SYSTEMCITY_CIDADE || 'exemplo';
  window.SYSTEMCITY_BASE = universo ? `/api/universos/${universo}/` : doBanco ? `/api/cidades/${doBanco}/` : `cities/${nome}/`;
  window.SYSTEMCITY_SLUG = doBanco || null; window.SYSTEMCITY_UNIVERSO = universo || null;

  // ?so=<bairro>: só esse bairro fica de pé, com os vizinhos de fora listados em recortes[<bairro>]; as rotas que perderam uma ponta caem
  function recortar(M) {
    const fica = (location.search.match(/[?&#]so=([\w-]+)/) || [])[1];
    if (!fica || !M.bairros.some(b => b.id === fica)) return;
    const vizinhos = (M.recortes || {})[fica] || [];
    M.bairros = M.bairros.filter(b => b.id === fica);
    M.predios = M.predios.filter(p => p.bairro === fica);
    M.externos = M.externos.filter(e => vizinhos.includes(e.id));
    M.nascentes = (M.nascentes || []).filter(n => n.bairro === fica);
    const ids = new Set([...M.predios.map(p => p.id), ...M.externos.map(e => e.id)]);
    for (const b of M.bairros) for (const e of [...(b.estacoes || []), ...(b.desvios || []), ...(b.extras || [])]) ids.add(e.id);
    for (const k of Object.keys(M.rotas)) if (!ids.has(M.rotas[k].de) || !ids.has(M.rotas[k].para)) delete M.rotas[k];
    M.ambiente = M.ambiente.filter(a => M.rotas[a.rota]);
  }

  window.SystemCity = {
    definir(mapa) {
      const M = { bairros: [], predios: [], externos: [], rotas: {}, ambiente: [], canais: [], documentos: [], diagnosticos: {}, conectores: [], ...mapa };
      if (!M.bairros.length) throw new Error('SystemCity: a cidade precisa de pelo menos um bairro.');
      recortar(M);
      if (!M.bairros.some(b => b.foco)) M.bairros[0].foco = true;
      window.CIDADE_MAPA = M;
      window.SYSTEMCITY_AOVIVO = /[?&]aovivo=/.test(location.search) || M.conectores.some(c => c && c.url && c.ligado !== false);
      // documentos por bairro, para as torres e o leitor: o próprio objeto, ou o nome do arquivo gerado por scripts/gerar-catalogo.mjs
      if (typeof M.catalogo === 'string') document.write(`<script src="${window.SYSTEMCITY_BASE}${M.catalogo}"><\/script>`);
      else if (M.catalogo) window.CIDADE_SPECS = M.catalogo;
      if (M.titulo) document.addEventListener('DOMContentLoaded', () => { document.title = M.titulo; const h = document.getElementById('titulo'); if (h) h.textContent = M.titulo; });
    },
  };

  // carregamento síncrono de propósito: os motores, logo abaixo na página, leem o mapa assim que rodam
  document.write(`<script src="${window.SYSTEMCITY_BASE}cidade.js"><\/script>`);
})();
