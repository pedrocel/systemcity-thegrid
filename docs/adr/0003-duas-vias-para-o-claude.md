# 0003 · Two roads to Claude: the SDK or the local CLI

**Status:** accepted

## Context
In production the server needs an API key and predictable behaviour. On a developer's laptop, asking for an API key just to try the project is friction, and many developers already have Claude Code installed and signed in.

## Decision
`servidor/ia.mjs` exposes one function, `perguntar(prompt, { sistema, json })`. With `ANTHROPIC_API_KEY` set it calls the official SDK; without it, it runs `claude -p` with tools disabled and JSON output. Callers never know which road was taken. JSON answers are parsed defensively (text before the object is ignored).

## Consequences
- `git clone && npm start` works with zero configuration for Claude Code users.
- Both roads report usage and cost to the cost tracker ([0004](0004-custo-de-ia-por-contexto.md)).
- The CLI road is slower to start and depends on a local install; it is meant for development and small private deployments.
