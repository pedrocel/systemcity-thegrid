// Planos: grátis, Time e Empresa. Os limites só valem com PLANOS=1 no servidor (desligados por padrão, para uso interno).
// O plano fica na equipe; quem não está em equipe paga como grátis. Mudar de plano: node planos.mjs <id da equipe> <plano>.
import { ErroUso } from './contas.mjs';

// custoMes: teto de gasto com IA por pessoa no mês, em dólares; protege a conta quando alguém usa muito mais que a média
export const PLANOS = {
  gratis: { nome: 'Grátis', pessoas: 5, cidadesGithubMes: 2, perguntasDia: 30, auditoriasMes: 1, custoMes: 1 },
  pro: { nome: 'Pro', preco: 'R$ 29,90/mês', pessoas: 10, cidadesGithubMes: 30, perguntasDia: 300, auditoriasMes: 20, custoMes: 4 },
  time: { nome: 'Time', pessoas: 25, cidadesGithubMes: 30, perguntasDia: 500, auditoriasMes: 40, custoMes: 8 },
  empresa: { nome: 'Empresa', pessoas: Infinity, cidadesGithubMes: Infinity, perguntasDia: Infinity, auditoriasMes: Infinity, custoMes: Infinity },
};
const ligado = () => process.env.PLANOS === '1';

export function planos(db, { assinaturas = null, custos = null } = {}) {
  const q = {
    planoEquipe: db.prepare('SELECT plano FROM equipes WHERE id = ?'),
    melhorPlano: db.prepare("SELECT max(CASE e.plano WHEN 'empresa' THEN 3 WHEN 'time' THEN 2 ELSE 1 END) AS n FROM equipes e JOIN equipe_membros m ON m.equipe = e.id WHERE m.usuario = ?"),
    pessoas: db.prepare('SELECT count(*) AS n FROM equipe_membros WHERE equipe = ?'),
    cidadesMes: db.prepare("SELECT count(*) AS n FROM cidades WHERE dono = ? AND fonte LIKE 'github:%' AND criada >= ?"),
  };
  const email = db.prepare('SELECT email FROM usuarios WHERE id = ?'), ORDEM = ['gratis', 'pro', 'time', 'empresa'];
  // o melhor entre o plano das equipes da pessoa e a assinatura dela na Kiwify
  const daPessoa = (u) => { const daEquipe = ['gratis', 'gratis', 'time', 'empresa'][q.melhorPlano.get(u).n || 1], proprio = assinaturas && assinaturas.planoDe((email.get(u) || {}).email);
    return proprio && ORDEM.indexOf(proprio) > ORDEM.indexOf(daEquipe) ? proprio : daEquipe; };
  const inicioMes = () => { const i = new Date(); i.setDate(1); i.setHours(0, 0, 0, 0); return i.getTime(); };
  const usoPerguntas = new Map();   // usuario -> { dia, n }
  return {
    ligado, daPessoa,
    podeAdicionar(equipe) { if (!ligado()) return; const p = PLANOS[(q.planoEquipe.get(equipe) || {}).plano || 'gratis'];
      if (q.pessoas.get(equipe).n >= p.pessoas) throw new ErroUso(`O plano ${p.nome} vai até ${p.pessoas} pessoas por equipe.`, 402); },
    podeGerarCidade(u) { if (!ligado()) return; const p = PLANOS[daPessoa(u)], inicio = new Date(); inicio.setDate(1); inicio.setHours(0, 0, 0, 0);
      if (q.cidadesMes.get(u, inicio.getTime()).n >= p.cidadesGithubMes) throw new ErroUso(`O plano ${p.nome} gera até ${p.cidadesGithubMes} cidades do GitHub por mês.`, 402); },
    podeAuditar(u) { if (!ligado()) return; const p = PLANOS[daPessoa(u)], n = db.prepare('SELECT count(*) AS n FROM auditorias WHERE quem = ? AND criada >= ?').get(u, inicioMes()).n;
      if (n >= p.auditoriasMes) throw new ErroUso(`O plano ${p.nome} faz ${p.auditoriasMes} auditoria(s) por mês.`, 402); },
    // teto de custo de IA no mês: vale para tudo que chama o Claude
    podeUsarIA(u) { if (!ligado() || !custos) return; const p = PLANOS[daPessoa(u)];
      if (custos.doMes(u) >= p.custoMes) throw new ErroUso(`Você chegou ao limite de uso de IA do plano ${p.nome} neste mês.`, 402); },
    podePerguntar(u) { if (!ligado()) return; const p = PLANOS[daPessoa(u)], dia = new Date().toDateString(), uso = usoPerguntas.get(u) || { dia, n: 0 };
      if (uso.dia !== dia) { uso.dia = dia; uso.n = 0; } if (uso.n >= p.perguntasDia) throw new ErroUso(`O plano ${p.nome} faz até ${p.perguntasDia} perguntas por dia à cidade.`, 402); uso.n++; usoPerguntas.set(u, uso); },
  };
}

// linha de comando: mudar o plano de uma equipe
if (process.argv[1] && process.argv[1].endsWith('planos.mjs')) {
  const [id, plano] = process.argv.slice(2); if (!id || !PLANOS[plano]) { console.error('uso: node planos.mjs <id da equipe> gratis|time|empresa'); process.exit(1); }
  const { abrir } = await import('./db.mjs'); const { join, resolve } = await import('node:path'); const { fileURLToPath } = await import('node:url');
  const db = abrir(process.env.BANCO || join(resolve(fileURLToPath(import.meta.url), '..'), 'dados/encontros.db'));
  const r = db.prepare('UPDATE equipes SET plano = ? WHERE id = ?').run(plano, Number(id)); console.log(r.changes ? `Equipe ${id} agora no plano ${PLANOS[plano].nome}.` : 'Equipe não encontrada.');
}
