// Atas: entrega a transcrição de uma chamada ao Claude (ia.mjs) e recebe de volta um markdown com resumo,
// decisões, atividades e os candidatos a ticket. Cada atividade vem marcada com o bairro da cidade a que pertence,
// para virar uma obra no mapa.
// SISTEMA_TICKETS  nome do seu sistema de tickets, para o texto da ata (padrão: "o sistema de tickets")
import { perguntar } from './ia.mjs';

export function montarPedido({ titulo, quando, participantes, falas, tickets, bairros = [] }) {
  const linhas = falas.map(f => `[${new Date(f.criada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}] ${f.nome}: ${f.texto}`).join('\n');
  return `Você recebe a transcrição automática de uma reunião. A transcrição pode ter erros de reconhecimento de voz: corrija palavras quando o sentido for óbvio, mas nunca invente decisões, tarefas, responsáveis ou prazos que não estejam na conversa.

Reunião: ${titulo}
Quando: ${quando}
Participantes: ${participantes.join(', ')}

Escreva SOMENTE o markdown abaixo, em português, sem nenhum texto antes ou depois:

# ${titulo}
_${quando} · ${participantes.join(', ')}_

## Resumo
(3 a 6 frases sobre o que foi discutido)

## Decisões
(lista; se não houve, escreva "Nenhuma decisão registrada.")

## Atividades
(uma linha por atividade combinada, no formato:)
- [ ] **Título curto da atividade** — responsável: Nome ou "a definir" — prazo: data ou "a definir"${bairros.length ? ' — bairro: id do bairro da cidade ou "nenhum"' : ''}
  Uma ou duas frases do que precisa ser feito e por quê.

## Candidatos a ticket
Itens que podem virar ticket em ${tickets}. Cada um é uma sugestão: quem leu decide se abre ou não.

| Título | Tipo | Prioridade | Responsável | Descrição |
| --- | --- | --- | --- | --- |
(Tipo: tarefa, bug, melhoria ou estudo. Prioridade: alta, média ou baixa, pelo tom da conversa. Se nada merece ticket, uma linha dizendo isso.)

## Pendências e dúvidas
(perguntas que ficaram em aberto; se não houve, escreva "Nada em aberto.")

${bairros.length ? `Bairros da cidade (id — nome: o que faz), para marcar em cada atividade o que ela afeta:\n${bairros.map(b => `${b.id} — ${b.nome}: ${b.desc || ''}`).join('\n')}\n\n` : ''}Transcrição:
${linhas}`;
}

export const gerarComClaude = (pedido) => perguntar(pedido, { maxTokens: 16000 });
