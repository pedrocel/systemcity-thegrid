// A IA do SystemCity. Dois caminhos para o mesmo Claude:
//   - com ANTHROPIC_API_KEY no ambiente (o caso do servidor online): a API da Anthropic, pelo SDK oficial;
//   - sem a chave (o caso da máquina de quem desenvolve): o Claude Code instalado (`claude -p`, sem ferramentas).
// Quem chama só passa o pedido e recebe o texto. `json: true` pede e devolve um objeto.
//
// CLAUDE_MODELO  modelo na API (padrão: claude-opus-5-5) · CLAUDE_CMD  caminho do Claude Code (padrão: claude)
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { anotar } from './custos.mjs';

const LIMITE_MS = 8 * 60e3, MODELO = process.env.CLAUDE_MODELO || 'claude-opus-5-5';
let cliente = null;

export const iaDisponivel = () => !!process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CMD !== '';
export const comoRoda = () => (process.env.ANTHROPIC_API_KEY ? 'api' : 'claude-code');

async function pelaApi(pedido, { sistema, maxTokens }) {
  if (!cliente) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); cliente = new Anthropic({ timeout: LIMITE_MS }); }
  const t0 = Date.now(); let r;
  try { r = await cliente.messages.create({ model: MODELO, max_tokens: maxTokens, ...(sistema ? { system: sistema } : {}), messages: [{ role: 'user', content: pedido }] }); }
  catch (e) { anotar({ modelo: MODELO, via: 'api', ms: Date.now() - t0, ok: false }); throw e; }
  anotar({ modelo: r.model || MODELO, via: 'api', uso: r.usage, ms: Date.now() - t0 });
  if (r.stop_reason === 'refusal') throw new Error('O Claude recusou esse pedido.');
  return r.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

function peloClaudeCode(pedido, { sistema }) {
  return new Promise((ok, falha) => {
    const comando = process.env.CLAUDE_CMD || 'claude', args = ['-p', '--tools', '', '--output-format', 'json', '--no-session-persistence', ...(sistema ? ['--system-prompt', sistema] : [])];
    const proc = spawn(comando, args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let saida = '', erro = '';
    const relogio = setTimeout(() => { proc.kill('SIGTERM'); falha(new Error('O Claude demorou demais para responder.')); }, LIMITE_MS);
    proc.stdout.on('data', d => { saida += d; }); proc.stderr.on('data', d => { erro += d; });
    proc.on('error', e => { clearTimeout(relogio); falha(new Error(e.code === 'ENOENT' ? `Não achei o Claude Code ("${comando}"). Defina ANTHROPIC_API_KEY ou CLAUDE_CMD.` : e.message)); });
    const t0 = Date.now();
    proc.on('close', codigo => { clearTimeout(relogio); if (codigo !== 0 || !saida.trim()) { anotar({ modelo: 'claude-code', via: 'claude-code', ms: Date.now() - t0, ok: false }); return falha(new Error(`O Claude não respondeu${erro ? ': ' + erro.trim().split('\n').pop() : '.'}`)); }
      // com --output-format json o CLI devolve o texto, o uso de tokens e o custo já calculado
      let j = null; try { j = JSON.parse(saida); } catch {}
      if (!j) return ok(saida);
      anotar({ modelo: Object.keys(j.modelUsage || {})[0] || 'claude-code', via: 'claude-code', uso: j.usage || {}, custo: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : null, ms: Date.now() - t0, ok: !j.is_error });
      if (j.is_error) return falha(new Error(`O Claude não respondeu: ${String(j.result || '').slice(0, 200)}`)); ok(String(j.result || '')); });
    proc.stdin.end(pedido);
  });
}

const semCerca = (t) => t.trim().replace(/^```(?:markdown|md|json|javascript|js)?\n([\s\S]*?)\n```$/, '$1').trim();

export async function perguntar(pedido, { sistema = null, maxTokens = 16000, json = false } = {}) {
  const texto = semCerca(process.env.ANTHROPIC_API_KEY ? await pelaApi(pedido, { sistema, maxTokens }) : await peloClaudeCode(pedido, { sistema }));
  if (!json) return texto;
  const i = texto.indexOf('{'), f = texto.lastIndexOf('}');   // às vezes vem uma frase antes do JSON
  try { return JSON.parse(texto.slice(i, f + 1)); } catch { throw new Error('O Claude não devolveu um JSON válido.'); }
}
