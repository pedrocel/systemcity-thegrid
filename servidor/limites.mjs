// Limite de tentativas: janela deslizante em memória por chave (IP, conta, e-mail). Protege o login de força bruta,
// o cadastro de robôs e a IA de gastar a chave da Anthropic sem freio.
import { ErroUso } from './contas.mjs';

export function limitador() {
  const baldes = new Map();   // chave -> [instantes]
  const limpeza = setInterval(() => { const agora = Date.now(); for (const [k, l] of baldes) if (!l.length || agora - l[l.length - 1] > 3600e3) baldes.delete(k); }, 600e3); limpeza.unref();
  return {
    // conta uma tentativa; passou de `max` em `janelaMs`, recusa com 429 dizendo quanto esperar
    contar(chave, max, janelaMs, msg = 'Muitas tentativas.') {
      const agora = Date.now(), l = (baldes.get(chave) || []).filter(t => agora - t < janelaMs);
      if (l.length >= max) { const espera = Math.ceil((janelaMs - (agora - l[0])) / 60000); baldes.set(chave, l); throw new ErroUso(`${msg} Tente de novo em ${espera} minuto${espera > 1 ? 's' : ''}.`, 429); }
      l.push(agora); baldes.set(chave, l);
    },
    zerar(chave) { baldes.delete(chave); },
    fechar: () => clearInterval(limpeza),
  };
}

// IP de quem chamou: atrás do Caddy vem no X-Forwarded-For (só confiamos nele quando a conexão vem da rede local do Docker)
export function ipDe(req) {
  const direto = req.socket.remoteAddress || '';
  if (/^(::ffff:)?(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)|^::1$/.test(direto)) { const f = (req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (f) return f; }
  return direto;
}
