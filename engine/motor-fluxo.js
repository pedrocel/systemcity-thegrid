// Fluxo de um bairro, desenhado. Na cidade normal o fluxo se infere vendo o operário andar;
// aqui ele vira linha: tubo colorido por cima do asfalto, seta apontando o sentido e rótulo no meio.
// O resto da cidade apaga, para sobrar só o módulo que você está lendo.
(() => {
  const C = window.CID; if (!C) return;
  const { scene, BAIRRO, BAIRROS, PREDIO, PREDIOS, ROTAS, vivos, hex, M } = C;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const Y = C.Y_RUA + 0.55;   // acima do asfalto, abaixo dos rótulos

  let ativo = null, desenho = null, apagados = [];
  // cuidado: em PREDIO, `p` é a posição [x,z] — a probabilidade do desvio só existe no mapa
  const chanceDesvio = {};
  for (const b of M.bairros) for (const d of b.desvios || []) if (d.p != null) chanceDesvio[d.id] = d.p;

  // ---------- quais rotas são deste bairro ----------
  const bairroDoPredio = (id) => (PREDIO[id] || {}).bairro || null;
  function rotasDo(id) {
    const b = BAIRRO[id], dentro = [], saindo = [];
    for (const [rid, r] of Object.entries(ROTAS)) {
      if (!r.pts || r.pts.length < 2) continue;
      const ba = bairroDoPredio(r.de), bb = bairroDoPredio(r.para);
      if (ba !== id && bb !== id) continue;
      const eDesvio = /:(ida|volta)$/.test(rid) || (PREDIO[r.de] || {}).tipo === 'desvio' || (PREDIO[r.para] || {}).tipo === 'desvio';
      (ba === id && bb === id ? dentro : saindo).push({ rid, r, eDesvio, paraFora: ba === id ? bb : ba, sentidoSaida: ba === id });
    }
    // a ordem da serpentina (`bairro:0`, `bairro:1`…) é a ordem do fluxo
    dentro.sort((x, y) => (Number((x.rid.match(/:(\d+)$/) || [])[1] ?? 99) - Number((y.rid.match(/:(\d+)$/) || [])[1] ?? 99)));
    return { b, dentro, saindo };
  }

  // ---------- desenho ----------
  const curvaDe = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, Y, z)), false, 'catmullrom', 0.02);

  function linha(pts, cor, grossura, opacidade) {
    const curva = curvaDe(pts);
    const g = new THREE.TubeGeometry(curva, Math.max(8, pts.length * 4), grossura, 6, false);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: opacidade, depthWrite: false }));
  }
  function setas(pts, cor, passo) {
    const curva = curvaDe(pts), comp = curva.getLength(), grupo = new THREE.Group();
    const n = Math.max(1, Math.floor(comp / passo));
    const geo = new THREE.ConeGeometry(0.62, 1.7, 7), mat = new THREE.MeshBasicMaterial({ color: cor });
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1), p = curva.getPointAt(t), tg = curva.getTangentAt(t);
      const m = new THREE.Mesh(geo, mat); m.position.copy(p);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg.clone().normalize());
      grupo.add(m);
    }
    return grupo;
  }
  function placa(texto, cor, pos) {
    const c = document.createElement('canvas'), pad = 18; const x = c.getContext('2d');
    x.font = '600 34px ui-sans-serif,system-ui,sans-serif';
    c.width = Math.ceil(x.measureText(texto).width) + pad * 2; c.height = 64;
    const y = c.getContext('2d');
    y.fillStyle = 'rgba(6,11,20,.9)'; y.fillRect(0, 0, c.width, c.height);
    y.strokeStyle = '#' + cor.toString(16).padStart(6, '0'); y.lineWidth = 4; y.strokeRect(2, 2, c.width - 4, c.height - 4);
    y.font = '600 34px ui-sans-serif,system-ui,sans-serif'; y.fillStyle = '#e8f1fb'; y.textBaseline = 'middle';
    y.fillText(texto, pad, c.height / 2 + 1);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(c.width / 64 * 2.1, 2.1, 1); s.position.copy(pos); return s;
  }

  function montar(id) {
    const { b, dentro, saindo } = rotasDo(id);
    const g = new THREE.Group(); scene.add(g);
    const corB = b.cor;

    for (const { rid, r, eDesvio } of dentro) {
      const cor = eDesvio ? 0xff5d6c : corB;
      g.add(linha(r.pts, cor, eDesvio ? 0.26 : 0.36, eDesvio ? 0.85 : 0.95));
      g.add(setas(r.pts, cor, eDesvio ? 14 : 11));
      if (eDesvio) {   // só o desvio ganha rótulo: o fluxo principal já tem as estações numeradas
        const d = PREDIO[r.de], p = PREDIO[r.para], alvo = (d || {}).tipo === 'desvio' ? d : p;
        if (alvo && !g.userData['rot-' + alvo.id]) {
          const c = curvaDe(r.pts).getPointAt(0.5); c.y = Y + 3.4;
          const ch = chanceDesvio[alvo.id];
          const pct = ch != null ? ` · ${Math.round(ch * 100)}%` : '';
          g.add(placa(alvo.nome + pct, 0xff5d6c, c)); g.userData['rot-' + alvo.id] = 1;
        }
      }
    }
    for (const { r, paraFora, sentidoSaida } of saindo) {
      const outro = BAIRRO[paraFora], cor = outro ? outro.cor : 0x9fd4ff;
      g.add(linha(r.pts, cor, 0.3, 0.6));
      g.add(setas(r.pts, cor, 16));
      const c = curvaDe(r.pts).getPointAt(sentidoSaida ? 0.72 : 0.28); c.y = Y + 3.4;
      const nome = outro ? outro.nome : ((PREDIO[sentidoSaida ? r.para : r.de] || {}).nome || 'fora');
      g.add(placa((sentidoSaida ? '→ ' : '← ') + nome, cor, c));
    }
    return { grupo: g, dentro, saindo, b };
  }

  // ---------- apagar o resto da cidade ----------
  function isolar(id) {
    apagados = [];
    for (const p of PREDIOS) {
      if (p.bairro === id) continue;
      const v = vivos[p.id]; if (!v || !v.mesh.visible) continue;
      v.mesh.visible = false; apagados.push(v.mesh);
      if (v.pedestal) { v.pedestal.visible = false; apagados.push(v.pedestal); }
    }
    for (const b of BAIRROS) {
      if (b.id === id) continue;
      for (const o of [...(b.objs || []), ...(b.enchimento || [])]) if (o && o.visible) { o.visible = false; apagados.push(o); }
    }
    for (const [bid, tor] of Object.entries(C.torres || {})) {   // torres de specs dos outros bairros
      if (bid === id || !tor) continue;
      for (const k of Object.keys(tor)) { const o = tor[k]; if (o && o.isObject3D && o.visible) { o.visible = false; apagados.push(o); } }
    }
    // rótulos: canal próprio. Não dá para usar C.oculto — a linha do tempo zera esse campo a cada quadro
    // (motor-tempo.js: `if (... && C.oculto) C.oculto = null`). C.soRotulos lista o que FICA visível.
    const ficam = new Set(['b:' + id]);
    for (const p of PREDIOS) if (p.bairro === id) ficam.add('p:' + p.id);
    C.soRotulos = ficam;
  }
  const devolver = () => { for (const o of apagados) o.visible = true; apagados = []; C.soRotulos = null; };

  // ---------- painel lateral ----------
  function painel(id, d) {
    const b = BAIRRO[id], ordem = [];
    for (const e of (M.bairros.find((x) => x.id === id) || {}).estacoes || []) ordem.push(PREDIO[e.id]);
    const desvios = PREDIOS.filter((p) => p.bairro === id && p.tipo === 'desvio');
    const fora = [...new Map(d.saindo.map((s) => [s.paraFora + s.sentidoSaida, s])).values()];
    return `<button class="fecha" title="Fechar" aria-label="Fechar">×</button>
      <div class="tipo" style="--cb:${hex(b.cor)}">Fluxo do bairro · linhas desenhadas</div>
      <h3>${esc(b.nome)}</h3>
      <div class="sub">${ordem.length} estação(ões) · ${desvios.length} desvio(s) · ${fora.length} ligação(ões) com outro módulo</div>
      <p class="nota">A linha grossa é o caminho que o documento percorre; a seta dá o sentido. Vermelho é desvio: sai do fluxo e volta. As linhas que saem do bairro vão para outro módulo.</p>
      ${ordem.filter(Boolean).map((e, k) => `<div style="border-left:2px solid ${hex(b.cor)};padding:2px 0 2px 10px;margin:10px 0">
        <b style="font:700 13px var(--titulo)">${k + 1}. ${esc(e.nome)}</b>
        ${e.desc ? `<div style="font-size:11.5px;color:var(--tinta-2);line-height:1.5;margin-top:2px">${esc(e.desc)}</div>` : ''}
        ${e.chama ? `<div style="font:400 10.5px var(--mono);color:var(--marca);margin-top:3px">chama outro módulo</div>` : ''}
      </div>`).join('')}
      ${desvios.length ? `<h3 style="font-size:15px;margin-top:16px">Desvios</h3>` : ''}
      ${desvios.map((v) => `<div style="border-left:2px solid #ff5d6c;padding:2px 0 2px 10px;margin:10px 0">
        <b style="font:700 13px var(--titulo)">${esc(v.nome)}${chanceDesvio[v.id] != null ? ` · ${Math.round(chanceDesvio[v.id] * 100)}%` : ''}</b>
        ${v.desc ? `<div style="font-size:11.5px;color:var(--tinta-2);line-height:1.5;margin-top:2px">${esc(v.desc)}</div>` : ''}
      </div>`).join('')}
      <button class="bt" data-fluxo="sair" style="margin-top:14px">Voltar para a cidade</button>`;
  }

  const aside = document.createElement('aside');
  aside.className = 'ficha vidro'; aside.id = 'fluxo'; aside.hidden = true;
  aside.style.cssText = 'left:16px;right:auto;z-index:7';
  document.body.appendChild(aside);

  function abrir(id) {
    if (ativo === id) return sair();
    if (ativo) sair(true);
    const b = BAIRRO[id]; if (!b) return;
    ativo = id; desenho = montar(id); isolar(id);
    const rolo = document.createElement('div'); rolo.className = 'rolo'; rolo.innerHTML = painel(id, desenho);
    aside.innerHTML = ''; aside.appendChild(rolo); aside.hidden = false;
    aside.querySelector('.fecha').onclick = () => sair();
    aside.querySelector('[data-fluxo="sair"]').onclick = () => sair();
    C.api.olharPara(b.c[0], b.c[1], Math.max(b.s[0], b.s[1]) * 0.92 + 26);
    const bt = document.querySelector('#b-fluxo'); if (bt) bt.setAttribute('aria-pressed', 'true');
  }
  function sair(silencioso) {
    if (!ativo) return;
    if (desenho) {
      scene.remove(desenho.grupo);
      desenho.grupo.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); });
    }
    desenho = null; ativo = null; devolver();
    if (!silencioso) { aside.hidden = true; const bt = document.querySelector('#b-fluxo'); if (bt) bt.setAttribute('aria-pressed', 'false'); }
  }

  C.fluxo = { abrir, sair, ativo: () => ativo };

  // botão da barra: abre o fluxo do bairro que estiver escolhido na ficha, ou pede para escolher
  const bt = document.querySelector('#b-fluxo');
  if (bt) bt.onclick = () => {
    if (ativo) return sair();
    const id = C.api.bairroAberto ? C.api.bairroAberto() : C.BAIRROS[0].id;
    abrir(id || C.BAIRROS[0].id);
  };
})();
