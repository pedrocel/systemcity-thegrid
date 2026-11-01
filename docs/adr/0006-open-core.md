# 0006 · Open core as an optional layer, not feature flags

**Status:** accepted

## Context
The project has a free community edition and a paid hosted edition. Feature flags would ship the paid code to everyone (a flag is one edit away) and scatter `if (paid)` checks across the codebase.

## Decision
The paid features live in a separate layer (`servidor/cloud/`, `engine/cloud/`) that the core loads only if it exists. The core hands the layer a small context (database, domain modules, response helpers); the layer contributes routes, a feature list exposed at `/api/eu`, and hooks. Pages ask the server which features exist and adapt. The community edition is exported from the same repository without that layer.

## Consequences
- The community edition is complete and honest: nothing hidden, nothing to unlock.
- The core has to stay extensible through a narrow interface, which keeps it clean.
- The core and the layer are tested separately; the core's tests run with the layer absent.
