# Conectores: a cidade com dados reais

Sem conector, a cidade simula o tráfego. Com um conector ligado, ela começa vazia e cada **evento** real solta um operário. Um evento é:

```json
{ "bairro": "pedidos", "tipo": "pd-t-b2b" }
```

`tipo` é opcional. Quando vem, precisa ser o `id` de um dos `operarios.tipos` do bairro.

## Direto do navegador

Na cidade, em `conectores`:

```js
conectores: [
  { tipo: 'http', url: 'https://api.minhaloja.com/pedidos/recentes', cada: 5000, headers: { authorization: 'Bearer ...' },
    mapa: (resposta) => resposta.map(p => ({ bairro: 'pedidos', tipo: p.b2b ? 'pd-t-b2b' : 'pd-t-simples' })) },
  { tipo: 'sse', url: 'http://localhost:4300/eventos' },
  { tipo: 'ws', url: 'wss://eventos.minhaloja.com', mapa: (msg) => ({ bairro: msg.modulo }) },
]
```

A API precisa liberar CORS para a origem da cidade. Não coloque segredo de produção numa página pública: nesse caso, passe pelo bridge.

Atalho para testar sem editar a cidade: `?aovivo=<url de um stream SSE>`.

## Bridge: MCP, APIs e webhooks

O bridge (`bridge/`) é um servidor Node pequeno. Ele junta as fontes, aplica os mapas e entrega tudo num único stream SSE, em `GET /eventos`. Os segredos ficam nele, fora do navegador.

```bash
cd bridge
npm install
cp config.exemplo.json config.json   # edite
npm start
```

### config.json

```json
{
  "porta": 4300,
  "origem": "*",
  "mcp": {
    "loja":    { "command": "node", "args": ["demo-mcp.mjs"] },
    "github":  { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "..." } },
    "remoto":  { "url": "https://meu-servidor-mcp.com/mcp", "headers": { "authorization": "Bearer ..." } }
  },
  "coletas": [
    { "mcp": "loja", "ferramenta": "pedidos_recentes", "argumentos": {}, "cada": 3000, "mapa": "mapas/pedidos.mjs" },
    { "url": "https://api.minhaloja.com/entregas/hoje", "cada": 10000, "mapa": "mapas/entregas.mjs" }
  ]
}
```

- **`mcp`**: servidores MCP locais, por `command` e `args` (stdio), ou remotos, por `url` (Streamable HTTP).
- **`coletas`**: o que perguntar e de quanto em quanto tempo (`cada`, em ms). Uma coleta chama uma ferramenta MCP ou consulta uma URL.
- **`mapa`**: um módulo `.mjs` cuja função padrão recebe a resposta e devolve a lista de eventos. A resposta de uma ferramenta MCP chega como `structuredContent`, ou como o texto convertido de JSON quando der.

```js
// mapas/pedidos.mjs
export default (pedidos) => pedidos.map(p => ({ bairro: 'pedidos', tipo: 'pd-t-' + p.tipo }));
```

### Webhook

Qualquer sistema pode empurrar eventos:

```bash
curl -X POST http://localhost:4300/evento -d '{"bairro":"logistica"}'
```

O corpo pode ser um evento só ou uma lista de eventos.

### Saúde

`GET /saude` devolve os servidores MCP conectados e quantas cidades estão ouvindo o stream.
