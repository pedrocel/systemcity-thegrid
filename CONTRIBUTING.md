# Contribuindo com o SystemCity

Obrigado por querer ajudar. Este guia é curto de propósito.

## Antes de começar

- Para mudanças grandes (um recurso novo, uma troca de arquitetura), abra uma issue primeiro e combine a ideia. Isso evita trabalho perdido.
- Para correções pequenas, pode mandar o Pull Request direto.
- Issues marcadas com **good first issue** são um bom ponto de partida.

## Rodar o projeto

```bash
cd servidor && npm install && npm start      # http://localhost:4400
```

Sem `ANTHROPIC_API_KEY`, o servidor usa o Claude Code local (`claude -p`). Os testes não chamam a IA.

## Testes

```bash
cd servidor && npm test                                              # servidor
cd e2e && npm install && npx playwright install chromium && npx playwright test   # navegador
```

O CI roda os dois em todo Pull Request. Recurso novo vem com teste.

## Estilo do código

- **Sem build e sem framework no front.** As páginas são HTML e JavaScript puros, e o motor 3D usa Three.js r128 sem bundler. Mantenha assim.
- **Leia o arquivo ao redor e escreva igual:** nomes em português, o mesmo jeito de comentar, a mesma densidade.
- **No servidor**, cada assunto é um módulo em `servidor/` (`cidades.mjs`, `auditoria.mjs`, `fontes.mjs`...) e as rotas ficam em `index.mjs`. Erros que a pessoa deve ver são `ErroUso`, com mensagem em português claro.
- **Dependência nova** precisa de um bom motivo. Hoje o servidor depende só de `ws`, do SDK da Anthropic e do cliente do CodeCommit.
- **Textos da interface** em português do Brasil, curtos e diretos.

## Pull Requests

1. Faça um fork e crie uma branch a partir da `main`.
2. Um assunto por Pull Request.
3. Explique o que muda e por quê, e como você testou. Para mudança visual, anexe um print ou GIF.
4. Rode os testes antes de mandar.

## Áreas onde ajuda faz muita diferença

- Novos provedores de código (GitLab, Azure DevOps, Gitea) em `servidor/fontes.mjs`.
- Novos conectores ao vivo em `bridge/`.
- Desempenho do motor 3D em cidades grandes.
- Tradução da interface para inglês e espanhol.
- Documentação e exemplos de cidades.

## Conduta

Este projeto segue o [Código de Conduta](CODE_OF_CONDUCT.md). Ao participar, você concorda com ele.
