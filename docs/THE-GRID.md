# The Grid: corrida de moto multiplayer

Uma pista de moto estilo Tron dentro do SystemCity, para jogar com o time e fazer a daily na corrida, com chamada de voz.

Precisa do servidor (`servidor/`) ligado e de conta nos Encontros. Entra pelo botão **▶ THE GRID**, no topo da cidade, ou por **The Grid** na barra de baixo.

## Como funciona

1. **Menu**: lista as corridas abertas, cria uma nova (nome, número de voltas, tempo-limite) e mostra o **placar geral**.
2. **Grade de largada**: quem entra já aparece na pista, parado na grade e com uma cor própria. Quem criou a corrida aperta **Largar**. Depois da largada, quem chega entra só para assistir e conversar.
3. **Contagem** 3, 2, 1, JÁ, e a corrida começa. A corrida acaba quando todos completam as voltas ou quando o tempo-limite estoura.
4. **Resultado**: pódio, tempos, melhor volta e pontos.

Durante a corrida, **Entrar na chamada** abre a chamada de voz da corrida numa janelinha no canto: dá para conversar enquanto pilota. A transcrição e a ata de atividades funcionam nela também.

| Tecla | Faz |
| --- | --- |
| W ou ↑ | acelera |
| S ou ↓ | freia e dá ré |
| A/D ou ←/→ | vira |
| Shift | turbo |
| Esc | sai da corrida |

## Pontuação

| | Pontos |
| --- | --- |
| Posição | 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 (do 1º ao 10º). Quem não completou nenhuma volta não pontua por posição. |
| Melhor volta da corrida | +5 |
| Completou todas as voltas | +3 |

Os pontos de cada corrida ficam no banco (`grid_pontos`). O placar geral soma tudo e mostra corridas, vitórias e a melhor volta de cada piloto.

## Animações

Contagem pulsando, faixas de **VOLTA 2/3**, **ÚLTIMA VOLTA** e **MELHOR VOLTA**, aviso quando você ganha ou perde posição, bandeirada na chegada, confete para o vencedor, pódio subindo e pontos contando no resultado. A câmera abre com a velocidade e mais ainda no turbo. Com "reduzir movimento" ligado no sistema, as animações ficam paradas.

## Por dentro

- `servidor/corridas.mjs`: as corridas ficam na memória do servidor, que é o relógio da prova (largada, tempo de volta, chegada). Volta mais rápida que 4 segundos é ignorada.
- `engine/motor-pista.js`: a pista e as motos. As motos dos outros andam suavizadas entre um aviso de posição e o seguinte.
- `engine/the-grid.js` e `the-grid.css`: menu, grade, painel, animações e resultado.
- Cada jogador manda a própria posição 10 vezes por segundo pelo WebSocket dos Encontros. Cada corrida tem uma sala de conversa própria, que é onde acontece a chamada.
