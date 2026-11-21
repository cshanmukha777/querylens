# Architecture decision record

## Parser

The initial parser is `node-sql-parser` 5.4.x. Its upstream documentation lists SQLite, PostgreSQL, and MySQL syntax, supports SELECT/INSERT/UPDATE/DELETE ASTs, and exposes optional location metadata. It is Apache-2.0, so the package README and release bundle must preserve that dependency's notice. Its AST is treated as an adapter boundary rather than leaked as the public result format. The project must maintain fixtures for each advertised dialect and reject parser errors or multi-statement input.

The alternative `sql-parser-cst` has a useful typed concrete syntax tree, but its upstream status describes PostgreSQL and MySQL support as experimental, so it is not a good fit for claiming equal dialect support in the initial release.

## Runtime and build

- Minimum runtime target: Node.js 22.13+, which is within a supported LTS line at the time of this decision. CI should test supported LTS releases.
- TypeScript strict mode and `tsup` produce ESM, CommonJS, and declarations.
- Vitest covers deterministic unit and SQLite integration behavior.
- Database drivers stay out of mandatory runtime dependencies. SQLite accepts an injected better-sqlite3-compatible handle; PostgreSQL/MySQL support is not advertised until implemented and tested.

## Analysis boundary

Static analysis never opens a connection. Scores summarize documented syntactic signals only. Runtime profiling is a separate opt-in layer using an explicit adapter. SQLite plan inspection uses non-executing `EXPLAIN QUERY PLAN`; no `EXPLAIN ANALYZE` is issued.

## Distribution boundary

- `tsup` builds the public library and CLI from `src/index.ts` and `src/cli.ts` as ESM, CommonJS, and declarations.
- The npm package contains the built output, README, API reference, license, and changelog. Source, tests, and contributor-only documentation stay in the GitHub repository.
- The CLI reads SQL files and performs static analysis or fingerprinting; it never opens a database connection.
- Runtime profiling uses an injected SQLite-compatible handle. QueryLens does not bundle a database driver or claim built-in PostgreSQL/MySQL profiling.
- The browser playground is maintained separately and is outside this package's release surface.
