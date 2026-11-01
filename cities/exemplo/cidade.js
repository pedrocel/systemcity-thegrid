// Cidade de exemplo: uma loja online com três bairros (Pedidos, Pagamentos e Logística) e três vizinhos de fora.
// Copie esta pasta para cities/<sua-cidade>/ e abra index.html?cidade=<sua-cidade>. O guia completo está em docs/CRIAR-CIDADE.md.
SystemCity.definir({
  titulo: 'Loja Online',

  // Cada bairro é um módulo do sistema. grade = [coluna, linha, colunas, linhas] na malha de quarteirões.
  // Com `estacoes`, o bairro se monta sozinho: as estações entram em serpentina, `porLinha` por linha, e o fluxo segue a ordem delas.
  // Deixe uma coluna a mais que `porLinha`: o canto de cima à direita é da torre de documentos.
  bairros: [
    { id: 'pedidos', nome: 'Pedidos', sub: 'carrinho, checkout e confirmação', grade: [-8, -4, 4, 4], cor: 0x3fa9f5, porLinha: 3, cada: 2.4, foco: true,
      desc: 'Onde o pedido nasce: o cliente monta o carrinho, fecha o checkout e recebe a confirmação.',
      operarios: {
        tipos: [
          { id: 'pd-t-simples', curto: 'Pedido', nome: 'Pedido de um item', cor: 0xffd24a, origem: 'pd-o-site', peso: 60, desc: 'O caso mais comum: um produto, frete padrão.' },
          { id: 'pd-t-grande', curto: 'Pedido grande', nome: 'Pedido com vários itens', cor: 0xff9d3c, origem: 'pd-o-app', peso: 30, desc: 'Vários produtos; o estoque é conferido item a item.' },
          { id: 'pd-t-b2b', curto: 'Pedido B2B', nome: 'Pedido de empresa', cor: 0xa78bfa, origem: 'pd-o-api', peso: 10, desc: 'Chega pela API de parceiros, já com preço negociado.' },
        ],
        origens: [
          { id: 'pd-o-site', nome: 'Site', cor: 0x3fa9f5, peso: 55, desc: 'Compra feita no navegador.' },
          { id: 'pd-o-app', nome: 'Aplicativo', cor: 0x5fd38d, peso: 35, desc: 'Compra feita no app do celular.' },
          { id: 'pd-o-api', nome: 'API de parceiros', cor: 0xf472b6, peso: 10, desc: 'Integração com o sistema de um cliente empresa.' },
        ] },
      estacoes: [
        { id: 'pd-carrinho', nome: 'Carrinho', desc: 'O cliente escolhe os produtos e o preço é calculado.' },
        { id: 'pd-checkout', nome: 'Checkout', desc: 'Endereço, frete e forma de pagamento.' },
        { id: 'pd-estoque', nome: 'Reserva de estoque', desc: 'Os itens ficam reservados enquanto o pagamento é aprovado.' },
        { id: 'pd-confirmado', nome: 'Pedido confirmado', desc: 'O pedido está aceito e segue para pagamento e entrega.' },
      ],
      desvios: [
        { id: 'pd-d-estoque', nome: 'Sem estoque', de: 'pd-estoque', volta: 'pd-checkout', p: 0.08, desc: 'Um item acabou: o cliente volta ao checkout para trocar ou remover.' },
      ] },

    { id: 'pagamentos', nome: 'Pagamentos', sub: 'autorização, antifraude e captura', grade: [-3, -4, 4, 4], cor: 0x5fd38d, porLinha: 3, cada: 3,
      desc: 'Cobra o pedido. A autorização pergunta ao gateway; o antifraude decide a cor do semáforo.',
      estacoes: [
        { id: 'pg-autoriza', nome: 'Autorização', chama: ['pgGateway'], desc: 'Pede ao gateway de pagamento a autorização do valor. Repare no risco indo ao gateway e voltando.' },
        { id: 'pg-antifraude', nome: 'Antifraude', semaforo: { green: 0.75, yellow: 0.18 }, desc: 'Daqui o pagamento sai verde (aprovado), âmbar (revisão manual) ou vermelho (suspeito).' },
        { id: 'pg-captura', nome: 'Captura', desc: 'O valor é efetivamente cobrado.' },
        { id: 'pg-conciliado', nome: 'Conciliado', desc: 'O pagamento bate com o extrato do gateway.' },
      ],
      desvios: [
        { id: 'pg-d-recusado', nome: 'Cartão recusado', de: 'pg-autoriza', volta: 'pg-autoriza', p: 0.1, desc: 'O banco recusou. O cliente tenta outro cartão e a autorização roda de novo.' },
      ] },

    { id: 'logistica', nome: 'Logística', sub: 'separação, despacho e entrega', grade: [2, -4, 4, 4], cor: 0xff9d3c, porLinha: 3, cada: 3.5, operario: 'Pacote',
      desc: 'Do estoque até a porta do cliente.',
      estacoes: [
        { id: 'lg-separa', nome: 'Separação', desc: 'Os itens são retirados das prateleiras.' },
        { id: 'lg-embala', nome: 'Embalagem', desc: 'O pacote é fechado e etiquetado.' },
        { id: 'lg-despacho', nome: 'Despacho', chama: ['lgTransp'], desc: 'O pacote é entregue à transportadora.' },
        { id: 'lg-entregue', nome: 'Entregue', desc: 'O cliente recebeu.' },
      ],
      desvios: [
        { id: 'lg-d-endereco', nome: 'Endereço não encontrado', de: 'lg-despacho', volta: 'lg-despacho', p: 0.06, desc: 'A transportadora não achou o endereço; o atendimento confirma com o cliente.' },
      ] },
  ],

  // Mundo de fora: sistemas que não são seus, mas com que a cidade conversa. q = [coluna, linha] do quarteirão.
  externos: [
    { id: 'gateway', nome: 'Gateway de pagamento', q: [-2, -7], f: [8, 8], h: 14, entra: 'Pedido de autorização', sai: 'Aprovado ou recusado', desc: 'O serviço que fala com os bancos e bandeiras.' },
    { id: 'transportadora', nome: 'Transportadora', q: [7, -2], f: [8, 9], h: 11, entra: 'Pacote etiquetado', sai: 'Status de entrega', desc: 'Leva o pacote até o cliente.' },
  ],

  // Ruas extras entre prédios (as do fluxo de cada bairro são criadas sozinhas). Uma estação usa a rota com `chama: ['<id da rota>']`.
  rotas: {
    pgGateway: { de: 'pg-autoriza', para: 'gateway', cor: 0x5fd38d },
    lgTransp: { de: 'lg-despacho', para: 'transportadora', cor: 0xff9d3c },
  },

  // Com ?so=pagamentos a cidade mostra só esse bairro; aqui vai a lista de vizinhos de fora que entram junto no recorte.
  recortes: { pagamentos: ['gateway'], logistica: ['transportadora'] },

  // Tráfego de fundo: um pulso numa rota de tempos em tempos, para mostrar conversa entre serviços fora dos fluxos.
  ambiente: [
    { rota: 'pgGateway', cada: 4, volta: 0x5fd38d },
  ],

  // Motivos de parada sorteados quando um operário cai num desvio (por id do desvio) e apontamentos de semáforo.
  diagnosticos: {
    'pg-d-recusado': [
      { cod: 'P01', causa: 'Saldo ou limite insuficiente.', resolver: 'O cliente usa outro cartão.', lado: 'Cliente' },
      { cod: 'P02', causa: 'O banco não respondeu a tempo.', resolver: 'Tentar de novo em alguns segundos.', lado: 'Banco' },
    ],
    apontamentos: [
      { cor: 'yellow', causa: 'Endereço de entrega diferente do de cobrança.', resolver: 'Revisão manual rápida.' },
      { cor: 'red', causa: 'Vários cartões testados em poucos minutos.', resolver: 'Bloquear e falar com o cliente.' },
    ],
  },

  // Dados ao vivo: com um conector ligado, cada evento real solta um operário e a simulação aleatória para.
  // Veja docs/CONECTORES.md. Exemplo com o bridge de MCP (bridge/):
  conectores: [
    // { tipo: 'sse', url: 'http://localhost:4300/eventos' },
    // { tipo: 'http', url: 'https://minha-api/pedidos/recentes', cada: 5000, mapa: (j) => j.map(p => ({ bairro: 'pedidos', tipo: p.b2b ? 'pd-t-b2b' : 'pd-t-simples' })) },
  ],

  // Documentos de cada bairro (torre de lâminas e leitor). Gere com: node scripts/gerar-catalogo.mjs <pasta-de-markdown> cities/exemplo
  catalogo: {
    repos: [{ repo: 'loja', branch: 'main', commit: 'exemplo' }],
    bairros: {
      pedidos: [
        { id: 'pedidos-checkout', bairro: 'pedidos', natureza: 'spec', slug: 'checkout', titulo: 'Checkout', status: 'aprovada', classe: 'ok', rn: 3, repos: ['loja'],
          docs: [{ chave: 'docs/checkout.md', repo: 'loja', caminho: 'docs/checkout.md', tipo: 'Spec', titulo: 'Checkout', status: 'aprovada', rn: 3, ca: 0 }] },
        { id: 'pedidos-adr-1', bairro: 'pedidos', natureza: 'adr', slug: 'adr-001', titulo: 'ADR 001 — reserva de estoque no checkout', status: 'aceita', classe: 'ok', rn: 0, repos: ['loja'],
          docs: [{ chave: 'docs/adr-001.md', repo: 'loja', caminho: 'docs/adr-001.md', tipo: 'ADR', titulo: 'Reserva de estoque no checkout', status: 'aceita', rn: 0, ca: 0 }] },
      ],
    },
  },
});
