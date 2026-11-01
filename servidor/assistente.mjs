// O assistente da cidade: responde perguntas olhando o mapa (que o navegador manda, com as filas do momento),
// os documentos da cidade guardada no banco e as últimas atas da equipe. Devolve a resposta e, quando faz sentido,
// o prédio ou bairro em que a câmera deve focar.
import { ErroUso } from './contas.mjs';
import { perguntar } from './ia.mjs';

const MAX_DOCS = 60000, MAX_ATAS = 3;

export function assistente({ cidades, conversas, equipes }) {
  function contexto(u, { slug, mapa }) {
    let docs = '', atas = '';
    if (slug) {
      const c = cidades.ver(slug, u); let usado = 0;
      for (const [bairro, t] of Object.entries(c.textos || {})) for (const [chave, md] of Object.entries(t)) { if (usado > MAX_DOCS) break; const trecho = md.slice(0, 8000); usado += trecho.length; docs += `\n\n### [${bairro}] ${chave}\n${trecho}`; }
      if (c.equipe) { const sala = equipes.ver(c.equipe, u).sala; for (const a of conversas.atas(sala, u).slice(0, MAX_ATAS)) atas += `\n\n### Ata: ${a.titulo} (${new Date(a.criada).toLocaleDateString('pt-BR')})\n${conversas.ata(a.id, u).markdown.slice(0, 6000)}`; }
    }
    return { docs, atas };
  }
  return {
    // roteiro do tour ou da apresentação: uma parada por bairro (e as de abertura, sistemas de fora e fecho), com narração curta
    async roteiro(u, { slug, mapa, modo }) {
      if (!mapa || !Array.isArray(mapa.bairros)) throw new ErroUso('Faltou o mapa da cidade.');
      const { docs } = contexto(u, { slug, mapa });
      const r = await perguntar(`Escreva o roteiro de ${modo === 'apresentar' ? 'uma apresentação para diretoria ou clientes (tom de pitch, foco em valor e em como o sistema funciona)' : 'um tour de onboarding para uma pessoa nova no time (tom acolhedor e didático, foco em como as coisas se ligam e onde cada coisa mora)'} pela "cidade" abaixo: a arquitetura de um sistema desenhada como bairros (módulos), prédios (etapas do fluxo) e sistemas de fora.

Responda SOMENTE com um JSON: { "paradas": [ { "tipo": "cidade" | "b" | "p", "id": "id do bairro (b) ou do prédio (p); omita em cidade", "titulo": "título curto", "texto": "narração de 2 a 4 frases, em português, para ser lida em voz alta" } ] }
Comece com uma parada "cidade" de abertura, passe por todos os bairros na ordem que fizer mais sentido (pode incluir 1 ou 2 prédios importantes como "p"), uma parada sobre os sistemas de fora se houver, e feche com uma parada "cidade". Entre 5 e 12 paradas. Use só o que está no mapa e nos documentos; não invente números.

Mapa:
${JSON.stringify(mapa).slice(0, 30000)}${docs ? `\n\nDocumentos:${docs.slice(0, 30000)}` : ''}`, { json: true, maxTokens: 6000 });
      const ids = new Set([...mapa.bairros.map(b => b.id), ...mapa.bairros.flatMap(b => (b.estacoes || []).map(e => e.id)), ...(mapa.externos || []).map(e => e.id)]);
      return { paradas: (r.paradas || []).filter(p => p && p.texto && (p.tipo === 'cidade' || ids.has(String(p.id)))).slice(0, 14).map(p => ({ tipo: p.tipo === 'b' || p.tipo === 'p' ? p.tipo : 'cidade', id: p.id ? String(p.id) : undefined, titulo: String(p.titulo || '').slice(0, 80), texto: String(p.texto).slice(0, 700) })) };
    },
    async responder(u, { slug, mapa, pergunta, historico = [] }) {
      pergunta = String(pergunta || '').trim().slice(0, 1000); if (!pergunta) throw new ErroUso('Faça uma pergunta.');
      if (!mapa || !Array.isArray(mapa.bairros)) throw new ErroUso('Faltou o mapa da cidade.');
      const { docs, atas } = contexto(u, { slug, mapa });
      const cidadeTxt = JSON.stringify(mapa).slice(0, 40000);
      const conversa = historico.slice(-6).map(h => `Pergunta: ${String(h.p).slice(0, 500)}\nResposta: ${String(h.r).slice(0, 1200)}`).join('\n\n');
      const pedido = `Você é o assistente de uma "cidade": a arquitetura de um sistema desenhada como bairros (módulos), prédios (estações do fluxo e serviços), desvios (caminhos de erro), ruas (chamadas entre eles) e sistemas de fora. Responda à pergunta da pessoa usando SÓ o que está abaixo. Se o mapa não tiver a informação, diga isso e sugira onde olhar. Seja direto: até 6 frases, em português, pode usar markdown simples (negrito, lista curta).

Responda SOMENTE com um JSON neste formato, sem texto antes ou depois:
{ "resposta": "texto em markdown", "foco": { "tipo": "b" | "p", "id": "id do bairro (b) ou do prédio/externo (p) de que a resposta mais fala" } ou null }

Mapa da cidade neste momento (ids, nomes, descrições, e "fila" = quantos itens estão dentro de cada prédio agora, "estado" = verde/âmbar/vermelho quando há semáforo):
${cidadeTxt}
${docs ? `\nDocumentos dos módulos:${docs}` : ''}${atas ? `\n\nÚltimas atas da equipe:${atas}` : ''}
${conversa ? `\nConversa até aqui:\n${conversa}\n` : ''}
Pergunta: ${pergunta}`;
      const r = await perguntar(pedido, { json: true, maxTokens: 4000 });
      const ids = new Set([...mapa.bairros.map(b => b.id), ...(mapa.predios || []).map(p => p.id)]);
      const foco = r.foco && ids.has(String(r.foco.id)) && ['b', 'p'].includes(r.foco.tipo) ? { tipo: r.foco.tipo, id: String(r.foco.id) } : null;
      return { resposta: String(r.resposta || '').slice(0, 4000), foco };
    },
  };
}
