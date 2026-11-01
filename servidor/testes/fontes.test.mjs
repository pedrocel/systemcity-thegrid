import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarFonte, nomeDoRepo, ehRepositorio } from '../fontes.mjs';

test('fontes: o prefixo diz o provedor; sem prefixo é GitHub', () => {
  assert.deepEqual(separarFonte('dono/repo'), { provedor: 'github', repo: 'dono/repo' });
  assert.deepEqual(separarFonte('https://github.com/dono/repo.git'), { provedor: 'github', repo: 'dono/repo' });
  assert.deepEqual(separarFonte('bitbucket:time/api'), { provedor: 'bitbucket', repo: 'time/api' });
  assert.deepEqual(separarFonte('https://bitbucket.org/time/api/src/main/'), { provedor: 'bitbucket', repo: 'time/api' });
  assert.deepEqual(separarFonte('codecommit:pagamentos'), { provedor: 'codecommit', repo: 'pagamentos' });
  assert.equal(nomeDoRepo('codecommit:pagamentos'), 'pagamentos'); assert.equal(ehRepositorio('modelo:saas'), false); assert.equal(ehRepositorio('bitbucket:a/b'), true);
});
