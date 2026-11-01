# 0004 · AI cost attributed through async context

**Status:** accepted

## Context
AI is the main variable cost. We need to know who spent what, on which kind of work, including work that a request starts and that finishes later in the background. Passing a "user" parameter through every function that might reach Claude would touch the whole codebase and would be forgotten in new code.

## Decision
Each HTTP request runs inside `AsyncLocalStorage` with `{ usuario, tipo, registrar }`. `ia.mjs` calls `anotar()` after every response; `anotar` reads the context and writes a row to `uso_ia` (tokens in/out, cache, cost, latency, success). Background jobs inherit the context automatically. Cost comes from token prices (overridable by environment) or, for the CLI, from the CLI's own report.

## Consequences
- Attribution is correct by default, even for new features, without touching their signatures.
- The admin dashboard and per-plan spending caps read the same table.
- Work started outside a request (a webhook from a code host) has no user; it is recorded with the target instead.
