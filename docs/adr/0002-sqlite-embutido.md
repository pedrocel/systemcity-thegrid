# 0002 · SQLite embedded in Node as the only database

**Status:** accepted

## Context
Accounts, teams, rooms, messages, cities, races and incidents are relational and small per installation. Self-hosters should run one container, and a backup should be "copy a file".

## Decision
Use `node:sqlite` (built into Node ≥ 22.13) in WAL mode with foreign keys on. The schema lives in `servidor/db.mjs` and migrations are idempotent checks that run at startup (add a column if it is missing). Each domain module prepares its own statements.

## Consequences
- No database server, driver or ORM; tests use `:memory:` and run in seconds.
- Backups are a file copy of the volume.
- One writer at a time. Fine for team-sized installations; a hosted multi-tenant service at large scale would shard by organisation or move to Postgres. The data access is concentrated in a few modules, which keeps that door open.
