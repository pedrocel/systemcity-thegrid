import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarFonte, nomeDoRepo, ehRepositorio } from '../fontes.mjs';

test('fontes: sem prefixo é GitHub, e provedor que o servidor não tem é recusado', () => {
  assert.deepEqual(separarFonte('dono/repo'), { provedor: 'github', repo: 'dono/repo' });
  assert.deepEqual(separarFonte('https://github.com/dono/repo.git'), { provedor: 'github', repo: 'dono/repo' });
  assert.deepEqual(separarFonte('github:dono/repo'), { provedor: 'github', repo: 'dono/repo' });
  assert.throws(() => separarFonte('gitea:time/api'), /não lê repositórios/);
  assert.equal(nomeDoRepo('github:dono/repo'), 'dono/repo'); assert.equal(ehRepositorio('modelo:saas'), false); assert.equal(ehRepositorio('github:a/b'), true);
});
