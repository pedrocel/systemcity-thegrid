// SystemCity — conversa de corredor e áudio espacial.
// Andando pela cidade, quando outra pessoa está a poucos passos, aparece o convite para conversar (uma chamada direta).
// Numa chamada, o volume de cada pessoa cai com a distância entre os bonecos dela e o seu na cidade: perto ouve alto, longe ouve baixo.
(() => {
'use strict';
const C = window.CID; if (!C || !C.encontros) return;
const ENC = C.encontros, $ = (s) => document.querySelector(s);
const PERTO = 14, LONGE = 90, recusados = new Map();   // usuario -> até quando não perguntar de novo
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.body.insertAdjacentHTML('beforeend', '<div class="corredor vidro" id="corredor" role="status" hidden></div>');
const aviso = $('#corredor');
const minhaPos = () => (C.andar && C.andar.ativo ? C.andar.pos : null);
const cidadeAtual = () => (window.SYSTEMCITY_SLUG ? window.SYSTEMCITY_SLUG : (window.SYSTEMCITY_BASE || '').split('/').filter(Boolean).pop());
function pessoasPerto() { const eu = ENC.eu(), p = minhaPos(); if (!eu || !p || !ENC.online) return [];
  return ENC.online().filter(o => o.id !== eu.id && o.x != null && o.cidade === cidadeAtual()).map(o => ({ ...o, d: Math.hypot(o.x - p.x, o.z - p.z) })).sort((a, b) => a.d - b.d); }

setInterval(() => {
  // convite: a pessoa mais perto, se ninguém recusou há pouco e você não está em chamada
  const perto = pessoasPerto().find(o => o.d < PERTO && !((recusados.get(o.id) || 0) > Date.now()));
  if (perto && !ENC.naChamada()) { if (aviso.dataset.u !== String(perto.id)) { aviso.dataset.u = perto.id;
      aviso.innerHTML = `<span><b>${esc(perto.nome)}</b> está bem aqui</span><button class="bt forte" id="cr-falar">Conversar</button><button class="bt" id="cr-nao">Agora não</button>`; aviso.hidden = false;
      $('#cr-falar').onclick = async () => { aviso.hidden = true; aviso.dataset.u = ''; const s = await ENC.api('POST', '/api/diretas', { com: perto.id }); ENC.entrarNaChamada(s.id, { compacta: true }); };
      $('#cr-nao').onclick = () => { recusados.set(perto.id, Date.now() + 5 * 60e3); aviso.hidden = true; aviso.dataset.u = ''; }; } }
  else if (!perto) { aviso.hidden = true; aviso.dataset.u = ''; }

  // áudio espacial: só quando você e a pessoa estão andando nesta cidade; senão, volume cheio
  const p = minhaPos(), online = ENC.online ? ENC.online() : [];
  for (const v of document.querySelectorAll('#enc-videos .enc-video:not(.eu)')) { const u = +v.dataset.u, o = online.find(x => x.id === u), video = v.querySelector('video'); if (!video) continue;
    let vol = 1; if (p && o && o.x != null && o.cidade === cidadeAtual()) { const d = Math.hypot(o.x - p.x, o.z - p.z); vol = Math.max(0.12, Math.min(1, 1 - (d - PERTO) / (LONGE - PERTO))); }
    video.volume += (vol - video.volume) * 0.5; v.style.setProperty('--vol', video.volume.toFixed(2)); v.classList.toggle('longe', vol < 0.5); }
}, 500);
})();
