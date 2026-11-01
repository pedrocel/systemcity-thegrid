// Banco dos encontros: SQLite embutido no Node (node:sqlite), num arquivo só. Nada para instalar.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function abrir(caminho) {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, hash TEXT NOT NULL, criado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessoes (
      token TEXT PRIMARY KEY, usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, expira INTEGER NOT NULL);
    -- sala: conversa em grupo, conversa direta entre duas pessoas, ou a sala de uma reunião
    CREATE TABLE IF NOT EXISTS salas (
      id INTEGER PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('grupo', 'direta', 'reuniao')),
      chave TEXT UNIQUE, criada_por INTEGER NOT NULL REFERENCES usuarios(id), criada INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS membros (
      sala INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE, usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      lida_ate INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (sala, usuario));
    CREATE TABLE IF NOT EXISTS mensagens (
      id INTEGER PRIMARY KEY, sala INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
      autor INTEGER NOT NULL REFERENCES usuarios(id), texto TEXT NOT NULL, criada INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS mensagens_sala ON mensagens (sala, id);
    CREATE TABLE IF NOT EXISTS reunioes (
      id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '', inicio INTEGER NOT NULL, fim INTEGER NOT NULL,
      sala INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE, criada_por INTEGER NOT NULL REFERENCES usuarios(id), criada INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS convidados (
      reuniao INTEGER NOT NULL REFERENCES reunioes(id) ON DELETE CASCADE, usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      resposta TEXT NOT NULL DEFAULT 'pendente' CHECK (resposta IN ('pendente', 'sim', 'nao', 'talvez')), PRIMARY KEY (reuniao, usuario));
    -- transcrição das chamadas: cada fala é uma frase final reconhecida no navegador de quem falou
    CREATE TABLE IF NOT EXISTS falas (
      id INTEGER PRIMARY KEY, sala INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
      autor INTEGER NOT NULL REFERENCES usuarios(id), texto TEXT NOT NULL, criada INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS falas_sala ON falas (sala, id);
    -- The Grid: os pontos de cada piloto em cada corrida terminada; o placar geral é a soma
    CREATE TABLE IF NOT EXISTS grid_pontos (
      id INTEGER PRIMARY KEY, usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, corrida TEXT NOT NULL,
      posicao INTEGER NOT NULL, pilotos INTEGER NOT NULL, pontos INTEGER NOT NULL, tempo INTEGER, melhor INTEGER, criada INTEGER NOT NULL);
    -- ata: o markdown de atividades que o Claude gerou a partir de um trecho de falas (ate = última fala usada)
    CREATE TABLE IF NOT EXISTS atas (
      id INTEGER PRIMARY KEY, sala INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE, titulo TEXT NOT NULL,
      markdown TEXT NOT NULL, de INTEGER NOT NULL, ate INTEGER NOT NULL, criada_por INTEGER NOT NULL REFERENCES usuarios(id), criada INTEGER NOT NULL);
    -- equipes: cada uma tem dono, membros e uma sala de conversa própria (a da equipe)
    CREATE TABLE IF NOT EXISTS equipes (
      id INTEGER PRIMARY KEY, nome TEXT NOT NULL, sala INTEGER NOT NULL REFERENCES salas(id), dono INTEGER NOT NULL REFERENCES usuarios(id), criada INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS equipe_membros (
      equipe INTEGER NOT NULL REFERENCES equipes(id) ON DELETE CASCADE, usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      papel TEXT NOT NULL DEFAULT 'membro' CHECK (papel IN ('dono', 'admin', 'membro')), entrou INTEGER NOT NULL, PRIMARY KEY (equipe, usuario));
    -- atividades tiradas das atas: cada uma pode virar ticket e aparece como obra no bairro que afeta até ser feita
    CREATE TABLE IF NOT EXISTS atividades (
      id INTEGER PRIMARY KEY, ata INTEGER NOT NULL REFERENCES atas(id) ON DELETE CASCADE, sala INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '', responsavel TEXT, prazo TEXT, bairro TEXT, feita INTEGER NOT NULL DEFAULT 0,
      ticket TEXT, criada INTEGER NOT NULL, feita_em INTEGER);
    CREATE INDEX IF NOT EXISTS atividades_bairro ON atividades (bairro, feita);
    -- incidentes: o prédio pega fogo e abre uma sala de guerra; ao resolver, o Claude escreve o post-mortem
    CREATE TABLE IF NOT EXISTS incidentes (
      id INTEGER PRIMARY KEY, cidade TEXT NOT NULL, predio TEXT NOT NULL, titulo TEXT NOT NULL, severidade TEXT NOT NULL, origem TEXT NOT NULL,
      sala INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE, aberto_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      aberto INTEGER NOT NULL, resolvido INTEGER, postmortem TEXT);
    -- instantes: a cada ~10 s, quantos itens havia em cada prédio de uma cidade (para o replay); guarda 7 dias
    CREATE TABLE IF NOT EXISTS instantes (cidade TEXT NOT NULL, quando INTEGER NOT NULL, filas TEXT NOT NULL, PRIMARY KEY (cidade, quando));
    -- redefinição de senha: guarda só o hash do token; vale 1 hora e uma vez
    CREATE TABLE IF NOT EXISTS redefinicoes (hash TEXT PRIMARY KEY, usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, expira INTEGER NOT NULL, usada INTEGER);
    -- universos: vários repositórios (cada um uma cidade) num mapa só, com as ligações entre eles desenhadas pelo Claude
    CREATE TABLE IF NOT EXISTS universos (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, dono INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      equipe INTEGER REFERENCES equipes(id) ON DELETE SET NULL, ligacoes TEXT NOT NULL DEFAULT '[]', criado INTEGER NOT NULL);
    -- commits do GitHub, guardados para a linha do tempo (arquivos = [[caminho, adições, remoções], ...])
    CREATE TABLE IF NOT EXISTS commits (
      repo TEXT NOT NULL, sha TEXT NOT NULL, quando INTEGER NOT NULL, autor TEXT NOT NULL, mensagem TEXT NOT NULL,
      arquivos TEXT NOT NULL, adicoes INTEGER NOT NULL DEFAULT 0, remocoes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (repo, sha));
    CREATE INDEX IF NOT EXISTS commits_quando ON commits (repo, quando);
    -- sessões do agente de código: a conversa com o Claude (mensagens da API), os passos mostrados ao dev e as alterações propostas
    CREATE TABLE IF NOT EXISTS agentes (
      id INTEGER PRIMARY KEY, repo TEXT NOT NULL, cidade TEXT, criado_por INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, titulo TEXT NOT NULL,
      estado TEXT NOT NULL, mensagens TEXT NOT NULL, passos TEXT NOT NULL, alteracoes TEXT NOT NULL, pr_url TEXT, criado INTEGER NOT NULL, atualizado INTEGER NOT NULL);
    -- cidades guardadas no banco: geradas do GitHub, de um modelo ou escritas à mão; definicao, catalogo e textos em JSON
    CREATE TABLE IF NOT EXISTS cidades (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, dono INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      equipe INTEGER REFERENCES equipes(id) ON DELETE SET NULL, fonte TEXT NOT NULL, definicao TEXT NOT NULL, catalogo TEXT, textos TEXT,
      criada INTEGER NOT NULL, atualizada INTEGER NOT NULL);
  `);
  const colunas = db.prepare('PRAGMA table_info(usuarios)').all().map(c => c.name);
  const colEquipes = db.prepare('PRAGMA table_info(equipes)').all().map(c => c.name);
  if (!colEquipes.includes('plano')) db.exec("ALTER TABLE equipes ADD COLUMN plano TEXT NOT NULL DEFAULT 'gratis'");   // gratis · time · empresa
  if (!colEquipes.includes('stripe')) db.exec('ALTER TABLE equipes ADD COLUMN stripe TEXT');   // cliente e assinatura no Stripe
  if (!colEquipes.includes('tickets')) db.exec('ALTER TABLE equipes ADD COLUMN tickets TEXT');   // integração de tickets (JSON com a credencial)
  const colCidades = db.prepare('PRAGMA table_info(cidades)').all().map(c => c.name);
  if (!colCidades.includes('webhook')) db.exec('ALTER TABLE cidades ADD COLUMN webhook TEXT');   // segredo do webhook do GitHub
  if (!colCidades.includes('universo')) db.exec('ALTER TABLE cidades ADD COLUMN universo INTEGER REFERENCES universos(id) ON DELETE SET NULL');
  if (!colCidades.includes('anterior')) db.exec('ALTER TABLE cidades ADD COLUMN anterior TEXT');   // definição antes da última regeração
  if (!colunas.includes('github_token')) db.exec('ALTER TABLE usuarios ADD COLUMN github_token TEXT');   // token só de leitura, para gerar cidades de repositórios privados
  // nick: o apelido único com que as pessoas se acham. Bancos antigos ganham a coluna e um nick tirado do e-mail.
  if (!colunas.includes('nick')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN nick TEXT');
    const usados = new Set(), dar = db.prepare('UPDATE usuarios SET nick = ? WHERE id = ?');
    for (const u of db.prepare('SELECT id, email FROM usuarios').all()) { const base = nickDe(u.email); let n = base, k = 1; while (usados.has(n)) n = `${base.slice(0, 17)}${++k}`; usados.add(n); dar.run(n, u.id); }
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS usuarios_nick ON usuarios (nick)');
  return db;
}

// sugestão de nick a partir de um e-mail ou nome: minúsculas, sem acento, só letras, números, ponto e sublinhado
export const nickDe = (texto) => (String(texto).split('@')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_.]+/g, '').slice(0, 20) || 'piloto').padEnd(3, '0');
