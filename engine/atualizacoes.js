// SystemCity — avisa quando a cidade aberta foi regerada (push no GitHub ou "Regerar"), com o que mudou, e recarrega com um clique.
(() => {
'use strict';
const C = window.CID, SLUG = window.SYSTEMCITY_SLUG; if (!C || !C.encontros || !SLUG) return;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
C.encontros.ouvir((m) => { if (m.t !== 'cidade:atualizada' || m.slug !== SLUG) return; const x = m.mudancas, linhas = [];
  if (x.bairrosNovos.length) linhas.push(`<li>Bairro${x.bairrosNovos.length > 1 ? 's' : ''} novo${x.bairrosNovos.length > 1 ? 's' : ''}: ${x.bairrosNovos.map(esc).join(', ')}</li>`);
  if (x.prediosNovos.length) linhas.push(`<li>Prédios novos: ${x.prediosNovos.slice(0, 6).map(esc).join(', ')}${x.prediosNovos.length > 6 ? '…' : ''}</li>`);
  if (x.bairrosSairam.length || x.prediosSairam.length) linhas.push(`<li>Saíram: ${[...x.bairrosSairam, ...x.prediosSairam].slice(0, 6).map(esc).join(', ')}</li>`);
  let el = document.getElementById('atualizada'); if (!el) { el = document.createElement('div'); el.id = 'atualizada'; el.className = 'inc-alerta vidro atualizada'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<span><b>A cidade foi atualizada${m.commit ? ` pelo push ${esc(m.commit)}` : ''}</b>${linhas.length ? `<ul>${linhas.join('')}</ul>` : '<br>A estrutura não mudou; os textos foram atualizados.'}</span><button class="bt forte" onclick="location.reload()">Ver a nova versão</button><button class="bt" onclick="this.parentElement.hidden=true">Depois</button>`;
  el.hidden = false; });
})();
