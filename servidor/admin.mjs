#!/usr/bin/env node
// Tarefas de administrador, na linha de comando (na VPS: docker exec systemcity node servidor/admin.mjs ...).
//   node admin.mjs link-senha <email>     gera um link de redefinição de senha (vale 1 hora) para mandar à pessoa
//   node admin.mjs contas                 lista as contas
import { abrir } from './db.mjs';
import { contas as criarContas } from './contas.mjs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const db = abrir(process.env.BANCO || join(resolve(fileURLToPath(import.meta.url), '..'), 'dados/encontros.db')), contas = criarContas(db);
const [cmd, arg] = process.argv.slice(2), base = process.env.ORIGENS ? process.env.ORIGENS.split(',')[0] : 'http://localhost:4400';
if (cmd === 'link-senha') { const r = contas.pedirRedefinicao(arg); if (!r) { console.error('Nenhuma conta com esse e-mail.'); process.exit(1); } console.log(`${r.usuario.nome}: ${base}/redefinir.html?t=${r.token}`); }
else if (cmd === 'contas') for (const u of db.prepare('SELECT id, nick, nome, email FROM usuarios ORDER BY id').all()) console.log(`${u.id}\t@${u.nick}\t${u.nome}\t${u.email}`);
else { console.error('uso: node admin.mjs link-senha <email> | contas'); process.exit(1); }
