// The Grid — a pista. Cena própria, vazio absoluto, só o circuito. Multiplayer: as motos dos outros jogadores entram
// por C.pista.remoto() e andam suavizadas; a corrida (largada, voltas, fim) é conduzida por the-grid.js.
// A moto anda PARAMETRIZADA pela curva (distância ao longo + desvio lateral) — assim ela nunca
// cai no vazio e a direção sempre parece de jogo de corrida, não de física solta.
(() => {
  const C = window.CID; if (!C) return;
  const { renderer } = C;
  const $ = (s) => document.querySelector(s);
  const CIANO = 0x37e6ff, LARANJA = 0xff8a3c;

  const cena = new THREE.Scene(); cena.background = new THREE.Color(0x01030a);
  cena.fog = new THREE.Fog(0x01030a, 260, 1500);
  const cam = new THREE.PerspectiveCamera(64, 1, 0.3, 4000);
  let pronto = false, ligado = false, curva = null, largura = 22, comprimento = 1000;
  let moto = null, trilha = null, trilhaPos = null, rastro = [];

  const E = { s: 0, d: 0, v: 0, dir: 0, volta: 1, melhor: null, tVolta: 0, giroRoda: 0 };
  let bloqueado = false, aoVolta = null, minhaCor = CIANO;
  const remotos = new Map();   // usuario -> { moto, placa, alvo: { s, d, dir, v }, s, d, dir, giro }
  const teclas = new Set();

  // ---------- pista de reserva: usada se o construtor não vier. Tem que ser boa por si só ----------
  function pistaReserva() {
    const g = new THREE.Group();

    // traçado fechado com retas longas e curvas de raio variado — circuito, não círculo
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = 400 + Math.sin(a * 3) * 150 + Math.cos(a * 5) * 60;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 2) * 9, Math.sin(a) * r));
    }
    const cv = new THREE.CatmullRomCurve3(pts, true);
    const N = 900, LARG = 22;
    const meio = [], eixoY = new THREE.Vector3(0, 1, 0), tg = new THREE.Vector3(), lat = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = cv.getPointAt(u);
      cv.getTangentAt(u, tg).normalize(); lat.crossVectors(tg, eixoY).normalize();
      meio.push({ p, lat: lat.clone() });
    }

    // asfalto: faixa de quads construída a mão, quase preta e fosca
    const pos = [], idx = [];
    meio.forEach((m, i) => {
      pos.push(m.p.x - m.lat.x * LARG / 2, m.p.y, m.p.z - m.lat.z * LARG / 2);
      pos.push(m.p.x + m.lat.x * LARG / 2, m.p.y, m.p.z + m.lat.z * LARG / 2);
      if (i < meio.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x04060b, roughness: 1, metalness: 0 })));

    // as duas linhas de neon nas bordas — é isso que faz a pista ser do Tron
    for (const s of [-1, 1]) {
      const borda = meio.map((m) => new THREE.Vector3(m.p.x + m.lat.x * s * (LARG / 2 - 0.5), m.p.y + 0.06, m.p.z + m.lat.z * s * (LARG / 2 - 0.5)));
      const cb = new THREE.CatmullRomCurve3(borda, true);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(cb, N, 0.4, 6, true), new THREE.MeshBasicMaterial({ color: CIANO })));
      // guard rail translúcido e emissivo
      const rp = [], ri = [];
      borda.forEach((b, i) => {
        rp.push(b.x, b.y, b.z); rp.push(b.x, b.y + 2.6, b.z);
        if (i < borda.length - 1) { const a = i * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
      const gr = new THREE.BufferGeometry();
      gr.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); gr.setIndex(ri);
      g.add(new THREE.Mesh(gr, new THREE.MeshBasicMaterial({ color: CIANO, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })));
    }

    // tracejado central
    const tracoGeo = new THREE.BoxGeometry(0.5, 0.02, 5);
    const tracoMat = new THREE.MeshBasicMaterial({ color: 0x1b6f8a });
    for (let i = 0; i < N; i += 26) {
      const m = meio[i], t2 = new THREE.Mesh(tracoGeo, tracoMat);
      t2.position.set(m.p.x, m.p.y + 0.05, m.p.z);
      t2.rotation.y = Math.atan2(m.lat.z, m.lat.x); g.add(t2);
    }

    // largada: faixa branca e pórtico
    const l0 = meio[0];
    const larg = new THREE.Mesh(new THREE.BoxGeometry(LARG, 0.03, 1.6), new THREE.MeshBasicMaterial({ color: 0xe8f4ff }));
    larg.position.set(l0.p.x, l0.p.y + 0.06, l0.p.z); larg.rotation.y = Math.atan2(l0.lat.z, l0.lat.x); g.add(larg);
    const portico = new THREE.Group(); portico.position.set(l0.p.x, l0.p.y, l0.p.z);
    portico.rotation.y = Math.atan2(l0.lat.z, l0.lat.x); g.add(portico);
    const escuro = new THREE.MeshStandardMaterial({ color: 0x080d14, roughness: 0.5, metalness: 0.7 });
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.2, 13, 1.2), escuro);
      col.position.set(s * (LARG / 2 + 1), 6.5, 0); portico.add(col);
      const fio = new THREE.Mesh(new THREE.BoxGeometry(0.2, 12, 0.2), new THREE.MeshBasicMaterial({ color: CIANO }));
      fio.position.set(s * (LARG / 2 + 0.3), 6.5, 0); portico.add(fio);
    }
    const viga = new THREE.Mesh(new THREE.BoxGeometry(LARG + 4, 1.6, 1.4), escuro); viga.position.y = 12.6; portico.add(viga);
    const fita = new THREE.Mesh(new THREE.BoxGeometry(LARG + 3, 0.28, 0.2), new THREE.MeshBasicMaterial({ color: LARANJA }));
    fita.position.set(0, 11.8, 0.72); portico.add(fita);

    // o Grid lá embaixo, e blocos distantes com aresta acesa
    const grade = new THREE.GridHelper(4200, 150, 0x0f6f92, 0x073246);
    grade.position.y = -95; grade.material.transparent = true; grade.material.opacity = 0.4; g.add(grade);
    const bloco = new THREE.MeshStandardMaterial({ color: 0x03060c, roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, r = 900 + (i % 5) * 260, alt = 60 + ((i * 53) % 190);
      const b = new THREE.Mesh(new THREE.BoxGeometry(70 + (i % 4) * 40, alt, 70 + (i % 3) * 50), bloco);
      b.position.set(Math.cos(a) * r, alt / 2 - 95, Math.sin(a) * r); g.add(b);
      const ar = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry), new THREE.LineBasicMaterial({ color: 0x1a86ab, transparent: true, opacity: 0.55 }));
      ar.position.copy(b.position); g.add(ar);
    }

    g.userData.curva = cv; g.userData.largura = LARG;
    return g;
  }

  // ---------- a moto ----------
  function construirMoto(cor = CIANO) {
    const g = new THREE.Group();
    const mEsc = new THREE.MeshStandardMaterial({ color: 0x080d15, roughness: 0.3, metalness: 0.85, emissive: 0x04101a, emissiveIntensity: 0.8 });
    const mN = new THREE.MeshBasicMaterial({ color: cor });
    const mFato = new THREE.MeshStandardMaterial({ color: 0x0b1119, roughness: 0.55, metalness: 0.5, emissive: 0x061620, emissiveIntensity: 0.9 });
    const cx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const pm = (geo, mat, x, y, z, pai) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (pai || g).add(m); return m; };

    const gDisco = new THREE.CylinderGeometry(0.66, 0.66, 0.2, 26); gDisco.rotateZ(Math.PI / 2);
    const gAro = new THREE.TorusGeometry(0.64, 0.065, 8, 38); gAro.rotateY(Math.PI / 2);
    const rodas = [[1.32], [-1.32]].map(([z]) => {
      const eixo = new THREE.Group(); eixo.position.set(0, 0.66, z); g.add(eixo);
      const roda = new THREE.Mesh(gDisco, mEsc); eixo.add(roda);
      roda.add(new THREE.Mesh(gAro, mN));
      return { eixo, roda };
    });
    pm(cx(0.32, 0.32, 2.1), mEsc, 0, 0.7, 0);
    pm(cx(0.38, 0.36, 0.8), mEsc, 0, 0.66, 0.86);
    pm(cx(0.34, 0.28, 0.68), mEsc, 0, 0.74, -0.95);
    for (const l of [-1, 1]) { pm(cx(0.02, 0.08, 2.0), mN, l * 0.17, 0.74, 0); pm(cx(0.05, 0.05, 0.52), mN, l * 0.15, 0.55, 0.98); }
    pm(cx(0.06, 0.03, 1.5), mN, 0, 0.86, -0.2);
    pm(cx(0.28, 0.05, 0.06), mN, 0, 0.53, 1.24);
    const p = new THREE.Group(); g.add(p);
    const tr = pm(cx(0.34, 0.26, 0.84), mFato, 0, 1.05, -0.12, p); tr.rotation.x = -0.5;
    pm(cx(0.32, 0.03, 0.58), mN, 0, 1.19, 0.0, p).rotation.x = -0.5;
    pm(new THREE.SphereGeometry(0.18, 14, 12), mFato, 0, 1.25, 0.4, p);
    pm(new THREE.SphereGeometry(0.135, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9df3ff }), 0, 1.22, 0.49, p);
    for (const l of [-1, 1]) {
      pm(cx(0.1, 0.1, 0.64), mFato, l * 0.18, 1.05, 0.44, p).rotation.x = 0.36;
      pm(cx(0.13, 0.14, 0.52), mFato, l * 0.16, 0.86, -0.64, p).rotation.x = -0.22;
    }
    const luz = new THREE.PointLight(cor, 1.3, 26); luz.position.set(0, 1.0, 0); g.add(luz);
    g.userData.rodas = rodas;
    return g;
  }

  // ---------- rastro ----------
  const N_TRILHA = 110;
  function construirTrilha() {
    trilhaPos = new Float32Array(N_TRILHA * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(trilhaPos, 3));
    const idx = []; for (let i = 0; i < N_TRILHA - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    trilha = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: minhaCor, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    trilha.frustumCulled = false; cena.add(trilha);
  }
  function moerRastro(x, y, z) {
    const u = rastro[rastro.length - 1];
    if (u && Math.hypot(x - u[0], z - u[2]) < 1.1) { u[0] = x; u[1] = y; u[2] = z; }
    else rastro.push([x, y, z]);
    while (rastro.length > N_TRILHA) rastro.shift();
    if (rastro.length < 2) { trilha.visible = false; return; }
    for (let i = 0; i < N_TRILHA; i++) {
      const p = rastro[Math.min(i, rastro.length - 1)], vivo = i < rastro.length;
      const f = i / Math.max(1, rastro.length - 1);
      const alt = vivo ? 2.1 * Math.min(1, f / 0.22) : 0;
      trilhaPos[i * 6] = p[0]; trilhaPos[i * 6 + 1] = p[1]; trilhaPos[i * 6 + 2] = p[2];
      trilhaPos[i * 6 + 3] = p[0]; trilhaPos[i * 6 + 4] = p[1] + alt; trilhaPos[i * 6 + 5] = p[2];
    }
    trilha.geometry.attributes.position.needsUpdate = true;
    trilha.geometry.computeBoundingSphere(); trilha.visible = true;
  }

  function montar() {
    const pecas = window.APT_PECAS || {};
    let g = null;
    if (typeof pecas.construirPista === 'function') {
      try { g = pecas.construirPista(THREE, (C.apto && C.apto.M) || {}, { raio: 420, largura: 22 }); } catch (e) { console.warn('pista falhou:', e.message); }
    }
    if (!g || !g.isObject3D || !g.userData || !g.userData.curva) { console.warn('usando pista de reserva'); g = pistaReserva(); }
    cena.add(g);
    curva = g.userData.curva; largura = g.userData.largura || 22;
    comprimento = curva.getLength();
    cena.add(new THREE.AmbientLight(0x2a4a68, 0.7));
    const d = new THREE.DirectionalLight(0x6fd0ff, 0.35); d.position.set(80, 200, -60); cena.add(d);
    moto = construirMoto(minhaCor); cena.add(moto);
    construirTrilha();
    pronto = true;
  }

  const eixoY = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), tg = new THREE.Vector3(), lat = new THREE.Vector3();

  function quadro(dt) {
    let acel = 0, vira = 0;
    if (teclas.has('KeyW') || teclas.has('ArrowUp')) acel += 1;
    if (teclas.has('KeyS') || teclas.has('ArrowDown')) acel -= 1;
    if (teclas.has('KeyA') || teclas.has('ArrowLeft')) vira -= 1;
    if (teclas.has('KeyD') || teclas.has('ArrowRight')) vira += 1;
    const turbo = teclas.has('ShiftLeft') || teclas.has('ShiftRight');
    const vMax = turbo ? 138 : 82;
    // freio-motor puxa para ZERO, nunca atravessa: sem tecla a moto para, não engata a ré sozinha
    if (bloqueado) { acel = 0; vira = 0; E.v = 0; }   // antes da largada e depois da chegada a moto fica parada
    if (acel > 0) E.v += 42 * dt;
    else if (acel < 0) E.v -= 56 * dt;
    else E.v -= Math.sign(E.v) * Math.min(Math.abs(E.v), 17 * dt);
    E.v = Math.max(-16, Math.min(vMax, E.v));
    E.dir += (vira - E.dir) * Math.min(1, dt * 7);
    const meia = largura / 2 - 1.4;
    E.d = Math.max(-meia, Math.min(meia, E.d + E.dir * dt * Math.min(22, 7 + Math.abs(E.v) * 0.22)));

    const antes = E.s;
    E.s = (E.s + (E.v * dt) / comprimento + 1) % 1;
    if (antes > 0.86 && E.s < 0.14 && E.v > 0) {                 // cruzou a largada
      if (E.tVolta > 4) { E.melhor = E.melhor == null ? E.tVolta : Math.min(E.melhor, E.tVolta); E.volta++; if (aoVolta) aoVolta(E.volta - 1); }
      E.tVolta = 0;
    }
    E.tVolta += dt;

    curva.getPointAt(E.s, pos); curva.getTangentAt(E.s, tg).normalize();
    lat.crossVectors(tg, eixoY).normalize();
    const px = pos.x + lat.x * E.d, pz = pos.z + lat.z * E.d, py = pos.y + lat.y * E.d;
    moto.position.set(px, py, pz);
    moto.rotation.set(0, Math.atan2(tg.x, tg.z), -E.dir * Math.min(1, Math.abs(E.v) / 44) * 0.6);
    E.giroRoda += E.v * dt / 0.66;
    for (const r of moto.userData.rodas) r.roda.rotation.x = E.giroRoda;
    if (Math.abs(E.v) > 2) moerRastro(px, py + 0.06, pz);

    // câmera de perseguição, presa à tangente
    const atras = 9.4 + Math.min(7, Math.abs(E.v) * 0.07);
    const cx2 = px - tg.x * atras - lat.x * E.d * 0.25, cz2 = pz - tg.z * atras - lat.z * E.d * 0.25;
    cam.position.lerp(new THREE.Vector3(cx2, py + 3.5, cz2), Math.min(1, dt * 5.5));
    cam.lookAt(px + tg.x * 7, py + 1.2, pz + tg.z * 7);

    moverRemotos(dt);
    const r = C.app.getBoundingClientRect();
    const fovAlvo = 64 + (turbo && E.v > 60 ? 16 : 0) + Math.min(6, Math.abs(E.v) * 0.04);   // a câmera abre com a velocidade e mais ainda no turbo
    cam.fov += (fovAlvo - cam.fov) * Math.min(1, dt * 4); cam.aspect = r.width / r.height; cam.updateProjectionMatrix();
    renderer.render(cena, cam);

    E.turbo = turbo;
  }

  // ---------- as motos dos outros: posição pela curva, como a minha, suavizada entre um aviso e outro ----------
  function placaNome(nome, cor) { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(1,3,10,.75)'; g.fillRect(0, 10, 256, 44); g.fillStyle = '#' + cor.toString(16).padStart(6, '0'); g.font = '600 28px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nome.slice(0, 16), 128, 33);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); sp.scale.set(5, 1.25, 1); sp.position.y = 3.1; sp.renderOrder = 10; return sp; }
  function remoto(u, est, cor, nome) {
    if (!pronto) montar();
    let r = remotos.get(u);
    if (!r) { const m = construirMoto(cor); m.add(placaNome(nome || '?', cor)); cena.add(m); r = { moto: m, s: est.s, d: est.d, dir: 0, v: 0, giro: 0, alvo: est }; remotos.set(u, r); }
    r.alvo = est;
  }
  function tirarRemoto(u) { const r = remotos.get(u); if (r) { cena.remove(r.moto); remotos.delete(u); } }
  function moverRemotos(dt) {
    for (const r of remotos.values()) {
      const a = r.alvo, k = Math.min(1, dt * 8); let ds = a.s - r.s; if (ds > 0.5) ds -= 1; if (ds < -0.5) ds += 1;   // pela volta mais curta, para não dar a volta toda ao cruzar a largada
      r.s = (r.s + ds * k + (a.v * dt) / comprimento * (1 - k) + 1) % 1; r.d += (a.d - r.d) * k; r.dir += (a.dir - r.dir) * k; r.v = a.v;
      curva.getPointAt(r.s, pos); curva.getTangentAt(r.s, tg).normalize(); lat.crossVectors(tg, eixoY).normalize();
      r.moto.position.set(pos.x + lat.x * r.d, pos.y + lat.y * r.d, pos.z + lat.z * r.d);
      r.moto.rotation.set(0, Math.atan2(tg.x, tg.z), -r.dir * Math.min(1, Math.abs(r.v) / 44) * 0.6);
      r.giro += r.v * dt / 0.66; for (const w of r.moto.userData.rodas) w.roda.rotation.x = r.giro;
    }
  }

  C.pista = {
    ativo: () => ligado, teclas, cena, cam, estado: E, remoto, tirarRemoto, comprimento: () => comprimento,
    remotoS: (u) => (remotos.get(u) || {}).s || 0,
    bloquear(sim) { bloqueado = !!sim; }, aoVolta(fn) { aoVolta = fn; },
    // grade de largada: até 4 motos lado a lado por fila, as filas atrás da linha
    entrar({ cor = CIANO, vaga = 0 } = {}) {
      if (minhaCor !== cor && pronto) { cena.remove(moto); moto = construirMoto(cor); cena.add(moto); trilha.material.color.setHex(cor); }
      minhaCor = cor; if (!pronto) montar();
      for (const u of [...remotos.keys()]) tirarRemoto(u);
      ligado = true; document.body.classList.add('pista');
      const fila = Math.floor(vaga / 4), faixa = vaga % 4;
      E.s = (1 + 0.002 - fila * (14 / comprimento)) % 1; E.d = (faixa - 1.5) * 4.5; E.v = 0; E.dir = 0; E.volta = 1; E.melhor = null; E.tVolta = 0;
      rastro = []; if (trilha) trilha.visible = false;
      renderer.shadowMap.enabled = false; renderer.setClearColor(0x01030a, 1);
    },
    sair() { ligado = false; bloqueado = false; aoVolta = null; for (const u of [...remotos.keys()]) tirarRemoto(u); document.body.classList.remove('pista'); rastro = []; if (trilha) trilha.visible = false; },
    quadro,
  };
})();
