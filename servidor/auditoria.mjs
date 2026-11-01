// Auditoria do código: quando o projeto entra (ou quando alguém pede), quatro agentes do Claude revisam o repositório em paralelo,
// cada um com um foco (segurança, bugs, desempenho e robustez). Os achados ficam no banco, ligados ao bairro onde o arquivo mora,
// e viram marcas na cidade. Cada achado pode ir para o agente de código, que prepara a correção e abre o PR com o dev.
import { ErroUso } from './contas.mjs';
import { lerRepositorio } from './cidades.mjs';
import { perguntar as perguntarClaude } from './ia.mjs';
import { bairroDoArquivo } from './historia.mjs';
import { separarFonte, ehRepositorio } from './fontes.mjs';

export const FOCOS = {
  seguranca: { nome: 'Segurança', o: 'falhas de segurança: injeção (SQL, comando, caminho), XSS, autenticação e autorização quebradas, segredos no código, criptografia fraca, SSRF, deserialização insegura, CORS e cookies mal configurados, validação de entrada ausente' },
  bugs: { nome: 'Bugs', o: 'bugs de lógica: condições erradas, off-by-one, null/undefined não tratado, corrida entre requisições, promessas sem await, erros engolidos, estado compartilhado, conversões de tipo e datas erradas' },
  desempenho: { nome: 'Desempenho', o: 'problemas de desempenho: consultas N+1, consultas sem índice ou sem limite, laços caros, trabalho síncrono bloqueante, falta de cache onde é óbvio, vazamento de memória, payloads grandes demais' },
  robustez: { nome: 'Robustez', o: 'falta de robustez: chamadas externas sem timeout nem retry, erros sem tratamento ou sem log, falta de idempotência, transações faltando, limites de tamanho ausentes, configuração frágil, código morto ou duplicado que esconde bug' },
};
const SEVERIDADES = ['critica', 'alta', 'media', 'baixa'], LOTE = 70000, PARALELO = 4;

const sistema = (foco) => `Você é um revisor de código sênior focado em ${FOCOS[foco].o}.
Revise só o código recebido. Aponte apenas problemas reais e concretos, com o arquivo e a linha (as linhas vêm numeradas). Nada de estilo, nada de gosto pessoal, nada de "poderia ter testes".
Se não houver nada sério, devolva a lista vazia. Escreva em português do Brasil.
Responda só com JSON: {"achados":[{"arquivo":"caminho/igual/ao/recebido","linha":12,"severidade":"critica|alta|media|baixa","titulo":"até 10 palavras","explicacao":"o problema e o que pode acontecer, 1 a 3 frases","sugestao":"como corrigir, 1 a 2 frases"}]}`;

// os arquivos em lotes que cabem num pedido, com as linhas numeradas
export function lotes(arquivos, tamanho = LOTE) {
  const saida = []; let atual = [], n = 0;
  for (const a of arquivos) { const texto = a.texto.split('\n').map((l, i) => `${i + 1}| ${l}`).join('\n'), bloco = `=== ${a.caminho} ===\n${texto}\n`;
    if (n + bloco.length > tamanho && atual.length) { saida.push(atual.join('\n')); atual = []; n = 0; } atual.push(bloco); n += bloco.length; }
  if (atual.length) saida.push(atual.join('\n')); return saida;
}
async function emParalelo(tarefas, limite) {
  const res = []; let i = 0; await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, async () => { while (i < tarefas.length) { const k = i++; res[k] = await tarefas[k]().catch(e => ({ erro: e.message })); } })); return res;
}

export function auditorias(db, { cidades, agentes, conexoes, ler = lerRepositorio, perguntar = perguntarClaude }) {
  db.exec(`CREATE TABLE IF NOT EXISTS auditorias (id INTEGER PRIMARY KEY, cidade TEXT NOT NULL, quem INTEGER, estado TEXT NOT NULL, progresso TEXT NOT NULL DEFAULT '{}',
    achados TEXT NOT NULL DEFAULT '[]', arquivos INTEGER NOT NULL DEFAULT 0, erro TEXT, criada INTEGER NOT NULL, terminada INTEGER);
    CREATE INDEX IF NOT EXISTS auditorias_cidade ON auditorias (cidade, id);`);
  const q = {
    nova: db.prepare("INSERT INTO auditorias (cidade, quem, estado, criada) VALUES (?, ?, 'rodando', ?)"),
    progresso: db.prepare('UPDATE auditorias SET progresso = ?, arquivos = ? WHERE id = ?'),
    fim: db.prepare('UPDATE auditorias SET estado = ?, achados = ?, erro = ?, terminada = ? WHERE id = ?'),
    ultima: db.prepare('SELECT * FROM auditorias WHERE cidade = ? ORDER BY id DESC LIMIT 1'), uma: db.prepare('SELECT * FROM auditorias WHERE id = ? AND cidade = ?'),
  };
  let emAndamento = Promise.resolve();
  const ler_ = (a) => a && { id: a.id, estado: a.estado, progresso: JSON.parse(a.progresso), arquivos: a.arquivos, erro: a.erro, criada: a.criada, terminada: a.terminada, achados: JSON.parse(a.achados) };

  async function rodar(id, c, u) {
    const prog = { lidos: 0, feitos: 0, total: 0 };
    try {
      const p = separarFonte(c.fonte).provedor, cred = conexoes.cred(c.dono, p) || conexoes.cred(u, p);
      const r = await ler(c.fonte, cred, { codigo: true }); if (!r.arquivos.length) throw new Error('Não achei arquivos de código para revisar.');
      const ls = lotes(r.arquivos), tarefas = []; prog.lidos = r.arquivos.length; prog.total = ls.length * Object.keys(FOCOS).length; q.progresso.run(JSON.stringify(prog), r.arquivos.length, id);
      for (const foco of Object.keys(FOCOS)) for (const lote of ls) tarefas.push(async () => {
        const j = await perguntar(`Repositório ${r.repo}.\n\n${lote}`, { sistema: sistema(foco), json: true, maxTokens: 8000 });
        prog.feitos++; q.progresso.run(JSON.stringify(prog), r.arquivos.length, id); return (j.achados || []).map(a => ({ ...a, foco }));
      });
      const resultados = await emParalelo(tarefas, PARALELO), falhas = resultados.filter(x => x && x.erro);
      if (falhas.length === resultados.length) throw new Error(falhas[0].erro);
      const existe = new Set(r.arquivos.map(a => a.caminho)), vistos = new Set(), achados = [];
      for (const a of resultados.filter(Array.isArray).flat()) {
        if (!a || !existe.has(a.arquivo) || !a.titulo) continue;   // o arquivo precisa existir: descarta o que o modelo inventou
        const sev = SEVERIDADES.includes(a.severidade) ? a.severidade : 'media', chave = `${a.arquivo}:${a.linha}:${a.foco}`; if (vistos.has(chave)) continue; vistos.add(chave);
        achados.push({ foco: a.foco, severidade: sev, arquivo: a.arquivo, linha: Number(a.linha) || null, titulo: String(a.titulo).slice(0, 120), explicacao: String(a.explicacao || '').slice(0, 600), sugestao: String(a.sugestao || '').slice(0, 400), bairro: bairroDoArquivo(a.arquivo, c.definicao.bairros || []) });
      }
      achados.sort((x, y) => SEVERIDADES.indexOf(x.severidade) - SEVERIDADES.indexOf(y.severidade));
      q.fim.run('pronta', JSON.stringify(achados.map((a, i) => ({ ...a, id: i }))), falhas.length ? `${falhas.length} de ${resultados.length} revisões falharam.` : null, Date.now(), id);
    } catch (e) { q.fim.run('falhou', '[]', String(e.message || e).slice(0, 300), Date.now(), id); }
  }

  return {
    // começa uma auditoria (uma por vez por cidade); devolve logo, o trabalho segue em segundo plano
    iniciar(slug, u) {
      const c = cidades.ver(slug, u); if (!ehRepositorio(c.fonte)) throw new ErroUso('A auditoria lê o código: só cidades geradas de um repositório têm uma.');
      const ult = q.ultima.get(slug); if (ult && ult.estado === 'rodando' && Date.now() - ult.criada < 30 * 60e3) return ler_(ult);
      const id = Number(q.nova.run(slug, u, Date.now()).lastInsertRowid); emAndamento = rodar(id, c, u); return ler_(q.ultima.get(slug));
    },
    aguardar: () => emAndamento,   // para os testes
    ver(slug, u) { cidades.ver(slug, u); return ler_(q.ultima.get(slug)); },
    // manda o achado para o agente de código: ele prepara a correção e o dev revisa antes do PR
    corrigir(slug, u, auditoria, achado) {
      const a = q.uma.get(auditoria, slug); if (!a) throw new ErroUso('Auditoria não encontrada.', 404); cidades.ver(slug, u);
      const x = JSON.parse(a.achados).find(y => y.id === Number(achado)); if (!x) throw new ErroUso('Achado não encontrado.', 404);
      return agentes.criar(u, { cidade: slug, pedido: `Corrija este problema apontado pela auditoria (${FOCOS[x.foco].nome}, severidade ${x.severidade}):\n${x.titulo}\nArquivo: ${x.arquivo}${x.linha ? `, linha ${x.linha}` : ''}\n\n${x.explicacao}\n\nSugestão: ${x.sugestao}\n\nConfirme lendo o código antes de mudar. Se não for um problema de verdade, diga isso e não altere nada.`, foco: x.bairro || x.arquivo });
    },
  };
}
