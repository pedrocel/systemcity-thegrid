// SystemCity — a rua viva (passo 3 da maquete): postes com poça de luz, árvores nas calçadas,
// faixas de pedestre e carros contornando os quarteirões com farol e lanterna.
// Cenário puro: nada aqui é clicável, colide ou representa dado. Fica no grupo de cada bairro (a linha do tempo esconde junto)
// e marcado userData.arq (o Modo Grid esconde junto). Desliga com ?maquete=0.
(() => {
  const C = window.CID; if (!C || !window.THREE || /[?&]maquete=0\b/.test(location.search)) return;
  const { scene, BAIRROS, P, LARG, Y_CALCADA, Y_RUA } = C, QUADRA = P - LARG;
  let s = 99; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const tmp = new THREE.Object3D();
  function inst(geo, mat, lista, pai, sombra) {
    if (!lista.length) return;
    const im = new THREE.InstancedMesh(geo, mat, lista.length);
    lista.forEach(([x, y, z, ry = 0, sc = 1], k) => { tmp.position.set(x, y, z); tmp.rotation.set(0, ry, 0); tmp.scale.setScalar(sc); tmp.updateMatrix(); im.setMatrixAt(k, tmp.matrix); });
    im.instanceMatrix.needsUpdate = true; im.castShadow = !!sombra; im.receiveShadow = true; im.userData.arq = true; pai.add(im); return im;
  }

  // geometrias e materiais compartilhados
  const gPoste = new THREE.CylinderGeometry(0.06, 0.09, 4.2, 6); gPoste.translate(0, 2.1, 0);
  const gBraco = new THREE.BoxGeometry(0.9, 0.06, 0.06); gBraco.translate(0.45, 4.15, 0);
  const gLamp = new THREE.BoxGeometry(0.42, 0.1, 0.2); gLamp.translate(0.85, 4.08, 0);
  const gPoca = new THREE.CircleGeometry(2.6, 24); gPoca.rotateX(-Math.PI / 2);
  const gTronco = new THREE.CylinderGeometry(0.07, 0.11, 1.4, 5); gTronco.translate(0, 0.7, 0);
  const gCopa = new THREE.IcosahedronGeometry(0.85, 1); gCopa.translate(0, 1.95, 0);
  const gFaixa = new THREE.PlaneGeometry(0.35, 1.9); gFaixa.rotateX(-Math.PI / 2);
  const mMetal = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.7 });
  const mLamp = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
  const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d');
  const grd = pg.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,200,130,.55)'); grd.addColorStop(0.5, 'rgba(255,170,90,.18)'); grd.addColorStop(1, 'rgba(255,160,80,0)');
  pg.fillStyle = grd; pg.fillRect(0, 0, 128, 128);
  const mPoca = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mTronco = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9 });
  const mCopa = new THREE.MeshStandardMaterial({ color: 0x1c3a26, roughness: 0.85, flatShading: true });
  const mFaixa = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.6, transparent: true, opacity: 0.75 });

  const meia = QUADRA / 2, borda = meia - 0.45;   // calçada: meio metro para dentro do meio-fio
  const carrosPorBairro = [];
  for (const b of BAIRROS) {
    const pai = b.objs && b.objs[0]; if (!pai || !b.grade) continue;
    const [i0, j0, cols, lins] = b.grade, ox = b.c[0], oz = b.c[1];
    const postes = [], bracos = [], poças = [], troncos = [], copas = [], faixas = [];
    for (let i = i0; i < i0 + cols; i++) for (let j = j0; j < j0 + lins; j++) {
      const x = i * P - ox, z = j * P - oz, y = Y_CALCADA;
      // postes nas quatro quinas, braço apontando para a rua
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = x + sx * borda, pz = z + sz * borda, ang = Math.atan2(-sz, sx) ;
        postes.push([px, y, pz]); bracos.push([px, y, pz, ang]);
        poças.push([px + Math.cos(ang) * 0.9 + sx * 0.8, Y_RUA + 0.02, pz - Math.sin(ang) * 0.9 + sz * 0.8]);
      }
      // árvores ao longo dos quatro lados, entre as quinas
      for (const lado of [0, 1, 2, 3]) for (const t of [-0.28, 0.28]) {
        if (r() < 0.3) continue;
        const u = t * QUADRA, px = x + (lado === 0 ? u : lado === 1 ? borda : lado === 2 ? u : -borda), pz = z + (lado === 0 ? -borda : lado === 1 ? u : lado === 2 ? borda : u);
        const sc = 0.8 + r() * 0.45; troncos.push([px, y, pz, r() * 6, sc]); copas.push([px, y, pz, r() * 6, sc]);
      }
      // faixas de pedestre atravessando a rua no meio de cada lado do quarteirão
      for (const [dx, dz, rot] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) {
        const cx = x + dx * (meia + LARG / 2), cz = z + dz * (meia + LARG / 2);
        for (let k = -2; k <= 2; k++) faixas.push(rot ? [cx, Y_RUA + 0.035, cz + k * 0.62, 0] : [cx + k * 0.62, Y_RUA + 0.035, cz, Math.PI / 2]);
      }
    }
    inst(gPoste, mMetal, postes, pai, true); inst(gBraco, mMetal, bracos, pai); inst(gLamp, mLamp, bracos, pai); inst(gPoca, mPoca, poças, pai);
    inst(gTronco, mTronco, troncos, pai, true); inst(gCopa, mCopa, copas, pai, true);
    inst(gFaixa, mFaixa, faixas, pai);

    // carros: cada um contorna um quarteirão do bairro, na mão direita
    const n = Math.min(10, cols * lins);
    const cGeoCorpo = new THREE.BoxGeometry(0.8, 0.32, 1.6); cGeoCorpo.translate(0, 0.32, 0);
    const cGeoCab = new THREE.BoxGeometry(0.7, 0.26, 0.8); cGeoCab.translate(0, 0.6, -0.05);
    const cGeoFarol = new THREE.BoxGeometry(0.66, 0.08, 0.04);
    const cores = [0x9aa3b0, 0x1f2430, 0x6b1b1b, 0x2d4a6e, 0xd8d8d2, 0x3a3f46];
    for (let k = 0; k < n; k++) {
      const q = [i0 + Math.floor(r() * cols), j0 + Math.floor(r() * lins)];
      const g = new THREE.Group(); g.userData.arq = true;
      const corpo = new THREE.Mesh(cGeoCorpo, new THREE.MeshStandardMaterial({ color: cores[k % cores.length], roughness: 0.35, metalness: 0.7 }));
      const cab = new THREE.Mesh(cGeoCab, new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.1, metalness: 0.9 }));
      const farol = new THREE.Mesh(cGeoFarol, new THREE.MeshBasicMaterial({ color: 0xfff4dd })); farol.position.set(0, 0.36, 0.8);
      const lant = new THREE.Mesh(cGeoFarol, new THREE.MeshBasicMaterial({ color: 0xff2020 })); lant.position.set(0, 0.38, -0.8);
      const facho = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.2), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
      facho.rotation.x = -Math.PI / 2; facho.position.set(0, 0.03, 2.4);
      [corpo, cab].forEach(m => { m.castShadow = true; }); g.add(corpo, cab, farol, lant, facho); pai.add(g);
      carrosPorBairro.push({ g, cx: q[0] * P - ox, cz: q[1] * P - oz, t: r() * 4, vel: 0.05 + r() * 0.05 });
    }
  }

  // o anel que o carro percorre: retângulo na faixa da direita, meia rua para fora do meio-fio
  const anel = meia + LARG * 0.28, per = anel * 8;
  function ponto(c, t) {
    const d = ((t % 1) + 1) % 1 * per, L = anel * 2;   // sentido anti-horário visto de cima = mão direita contornando o quarteirão
    if (d < L) return [c.cx + anel, c.cz + anel - d, Math.PI];
    if (d < 2 * L) return [c.cx + anel - (d - L), c.cz - anel, -Math.PI / 2];
    if (d < 3 * L) return [c.cx - anel, c.cz - anel + (d - 2 * L), 0];
    return [c.cx - anel + (d - 3 * L), c.cz + anel, Math.PI / 2];
  }
  let ult = performance.now();
  (function andar() {
    const agora = performance.now(), dt = Math.min(0.05, (agora - ult) / 1000); ult = agora;
    for (const c of carrosPorBairro) {
      if (!c.g.parent || !c.g.parent.visible || !c.g.visible) continue;
      c.t += dt * c.vel; const [x, z, ang] = ponto(c, c.t); c.g.position.set(x, Y_RUA, z); c.g.rotation.y = ang;
    }
    requestAnimationFrame(andar);
  })();
  C.rua = { carros: carrosPorBairro.length };
})();
