// SystemCity — foto da cidade. Renderiza a cena em alta resolução (o dobro da tela, até 4K de largura) com o nome da cidade
// e baixa um PNG: para a documentação, a apresentação e o README.
(() => {
'use strict';
const C = window.CID; if (!C || !C.renderer) return;
const bt = document.createElement('button'); bt.className = 'bt'; bt.id = 'b-foto'; bt.textContent = 'Foto'; bt.title = 'Baixar uma foto da cidade em alta resolução';
const barra = document.querySelector('.barra'); if (!barra) return; barra.insertBefore(bt, document.getElementById('b-cidade'));
bt.onclick = () => {
  const r = C.renderer, cv = r.domElement, w = cv.clientWidth, h = cv.clientHeight, antes = r.getPixelRatio(), escala = Math.min(4096 / w, Math.max(2, devicePixelRatio));
  r.setPixelRatio(escala); r.setSize(w, h, false); r.render(C.scene, C.camera);
  const foto = document.createElement('canvas'); foto.width = cv.width; foto.height = cv.height; const g = foto.getContext('2d');
  g.fillStyle = '#05080f'; g.fillRect(0, 0, foto.width, foto.height); g.drawImage(cv, 0, 0);
  r.setPixelRatio(antes); r.setSize(w, h, false);   // de volta ao tamanho da tela
  const titulo = (C.M && C.M.titulo) || document.title, s = foto.width / 1600;
  g.font = `800 ${Math.round(44 * s)}px system-ui, sans-serif`; g.fillStyle = 'rgba(232,240,255,.95)'; g.fillText(titulo, 40 * s, 76 * s);
  g.font = `600 ${Math.round(20 * s)}px system-ui, sans-serif`; g.fillStyle = 'rgba(55,230,255,.85)'; g.fillText('SystemCity', 40 * s, foto.height - 34 * s);
  foto.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b);
    a.download = `${String(titulo).normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'cidade'}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
};
})();
