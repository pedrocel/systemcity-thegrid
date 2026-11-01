# 0001 · No build step on the front end

**Status:** accepted

## Context
The product is a 3D engine plus a handful of pages. The people most likely to change it (contributors, curious developers, the author months later) want to open a file, change a line and refresh. A bundler, a framework and a transpiler would add hundreds of dependencies and a toolchain that breaks on its own schedule.

## Decision
Pages are plain HTML and modern JavaScript, loaded with `<script>` tags. Three.js r128 is vendored in `engine/vendor/`. Engine modules are IIFEs that attach to one shared object, `window.CID`, and the load order in `cidade.html` is the dependency graph.

## Consequences
- Zero install to work on the front end; the static city runs from `python3 -m http.server` and GitHub Pages.
- No tree-shaking or minification. Acceptable: the payload is dominated by Three.js, and pages are cached.
- Module boundaries are a convention, not enforced by imports. Mitigated by keeping each module small and documenting what it reads from `CID`.
- Pinned to Three.js r128 (the last version with the classic `examples/js` scripts). Upgrading means moving to ES modules, which can be done without a bundler via import maps.
