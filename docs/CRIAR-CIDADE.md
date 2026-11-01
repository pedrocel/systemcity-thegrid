# Criar uma cidade

Uma cidade é um arquivo, `cities/<nome>/cidade.js`, que chama `SystemCity.definir({...})`. Use `cities/exemplo/cidade.js` como ponto de partida: cada campo está comentado lá.

## A malha

A cidade é uma malha de quarteirões. A rua é o vão entre eles. Posições são sempre **coluna e linha de quarteirão**, nunca pixels:

- `grade: [coluna, linha, colunas, linhas]` é o retângulo de um bairro;
- `q: [coluna, linha]` é o quarteirão de um prédio solto.

Colunas crescem para leste e linhas para o sul. Deixe um quarteirão vazio entre bairros vizinhos.

## Bairro

```js
{ id: 'pedidos', nome: 'Pedidos', sub: 'linha de baixo do nome', cor: 0x3fa9f5,
  grade: [-8, -4, 4, 4], porLinha: 3, cada: 2.4, foco: true,
  desc: 'O que o módulo faz.',
  estacoes: [ ... ], desvios: [ ... ], operarios: { tipos: [ ... ], origens: [ ... ] } }
```

| Campo | O que faz |
| --- | --- |
| `porLinha` | quantas estações por linha. As estações entram em serpentina, na ordem do fluxo. |
| `grade` | precisa de `porLinha + 1` colunas: o canto de cima à direita é da torre de documentos. Com desvios, cada linha de estações ocupa duas linhas da grade. |
| `cada` | segundos, em média, entre um operário novo e o próximo, na simulação. |
| `foco` | destaca o bairro. Ele fica mais aceso e é onde a câmera e o "andar" começam. |
| `operario` | nome do operário quando o bairro não tem `operarios.tipos`. |
| `semItens` | bairro sem operários próprios. |

## Estação

```js
{ id: 'pg-antifraude', nome: 'Antifraude', desc: 'Aparece na ficha e na narração.',
  semaforo: { green: 0.75, yellow: 0.18 },   // opcional: daqui o item sai verde, âmbar ou vermelho
  chama: ['pgGateway'],                       // opcional: rotas que piscam ida e volta quando um item chega
  espera: [1.6, 4.2] }                        // opcional: tempo de atendimento, em segundos
```

## Desvio

O caminho de erro de uma estação. O operário desce para o desvio, espera e volta.

```js
{ id: 'pg-d-recusado', nome: 'Cartão recusado', de: 'pg-autoriza', volta: 'pg-autoriza', p: 0.1, desc: '...' }
```

`p` é a chance de cair no desvio. `volta` pode ser a própria estação ou uma anterior. Os motivos de parada sorteados ficam em `diagnosticos['<id do desvio>']`.

## Tipos de operário e origens

O capacete mostra o **tipo** e a mochila, a **origem**. A lente "Tipo" e a lente "Origem" pintam o operário inteiro com essas cores.

```js
operarios: {
  tipos:   [{ id: 'pd-t-b2b', curto: 'Pedido B2B', nome: 'Pedido de empresa', cor: 0xa78bfa, origem: 'pd-o-api', peso: 10, passos: ['...'], desc: '...' }],
  origens: [{ id: 'pd-o-api', nome: 'API de parceiros', cor: 0xf472b6, peso: 10, desc: '...' }] }
```

`passos` é opcional: limita o tipo a algumas estações do fluxo. `peso` define a proporção na simulação.

## Mundo de fora

Sistemas que não são seus: um gateway, um ERP, um órgão do governo, a nuvem de outro time.

```js
externos: [{ id: 'gateway', nome: 'Gateway de pagamento', subn: 'opcional', q: [-2, -7], f: [8, 8], h: 14, entra: '...', sai: '...', desc: '...' }]
```

`f` é a base do prédio e `h` a altura.

## Rotas e ambiente

As ruas do fluxo de cada bairro são criadas sozinhas. `rotas` é para as ligações extras, como a de uma estação com um sistema de fora:

```js
rotas: { pgGateway: { de: 'pg-autoriza', para: 'gateway', cor: 0x5fd38d, semTrafego: false } }
```

`ambiente` solta pulsos de tempos em tempos numa rota, para mostrar a conversa entre serviços:

```js
ambiente: [{ rota: 'pgGateway', cada: 4, volta: 0x5fd38d }]
```

## Fluxos escritos à mão

Para um bairro com prédios posicionados à mão, sem serpentina, use `predios` (com `bairro`), `fluxo` e `nascentes`:

```js
predios: [{ id: 'fila', bairro: 'nucleo', nome: 'Fila', tipo: 'estacao', n: 1, q: [0, 0], f: [8, 8], h: 8, desc: '...' }, ...],
fluxo: { fila: { espera: [1, 3], prox: { rota: 'filaWorker', para: 'worker' } }, worker: { espera: [2, 5], fim: true } },
nascentes: [{ bairro: 'nucleo', nome: 'Job', cada: 3, em: 'fila', t: 1, passos: ['fila', 'worker'] }]
```

## Documentos

A torre de cada bairro mostra uma lâmina por documento: verde aprovado, âmbar em andamento, cinza sem status, lilás para ADR. Para gerar a partir dos seus repositórios, crie `cities/<nome>/fontes.json`:

```json
{
  "repos": [{ "repo": "loja-api", "pasta": "../../../loja-api" }],
  "bairros": { "pedidos": ["loja-api/docs/pedidos/**"], "pagamentos": ["loja-api/docs/pagamentos/**"] }
}
```

Rode `node scripts/gerar-catalogo.mjs cities/<nome>/fontes.json` e coloque `catalogo: 'catalogo.js'` na cidade. O status sai de uma linha `Status: ...` no markdown, e as regras de negócio contadas são as marcações `RN-01`, `RN-02` etc.

## Recortes

`?so=<id do bairro>` mostra um bairro só. Os vizinhos de fora com que ele conversa entram junto, se a cidade declarar `recortes: { '<bairro>': ['<externo>', ...] }`.
