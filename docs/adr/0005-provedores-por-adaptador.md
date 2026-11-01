# 0005 · Code hosts as registrable adapters

**Status:** accepted

## Context
Cities, audits and regeneration all need the same four things from a code host: default branch, file tree, file contents, and the list of repositories an account can see. GitHub, Bitbucket and AWS CodeCommit expose them very differently (REST with a recursive tree, paginated `src` listings, SDK calls folder by folder).

## Decision
`servidor/fontes.mjs` defines the adapter shape (`info`, `arvore`, `conteudo`, `listar`, `conta`, `validarCred`) and ships the GitHub adapter. Other adapters call `registrarFonte(id, adapter)`. A city's source is stored as `<provider>:<repo>`, and everything above the adapter is provider-agnostic.

## Consequences
- Adding GitLab, Gitea or Azure DevOps is one file and no changes elsewhere: a good first contribution.
- Credentials are validated against the provider before being stored and are never sent back to the browser.
- Provider-specific features (push webhooks, git history) stay explicit about which providers they support.
