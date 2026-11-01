// Servidor MCP de demonstração: uma ferramenta "pedidos_recentes" que devolve pedidos inventados.
// Serve para testar o caminho inteiro (MCP → bridge → cidade) sem depender de nenhum sistema real.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const servidor = new McpServer({ name: 'loja-demo', version: '0.1.0' });
const tipos = ['simples', 'simples', 'simples', 'grande', 'b2b'];

servidor.registerTool('pedidos_recentes', { description: 'Pedidos que chegaram desde a última consulta.' }, async () => {
  const pedidos = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, (_, i) => ({ id: Date.now() + i, tipo: tipos[Math.floor(Math.random() * tipos.length)] }));
  return { content: [{ type: 'text', text: JSON.stringify(pedidos) }] };
});

await servidor.connect(new StdioServerTransport());
