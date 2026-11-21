# QueryLens

**Understand your SQL. Detect bottlenecks. Optimize with confidence.**

QueryLens provides static SQL structure checks and opt-in database profiling. Static scores describe query structure; they do not predict execution time or guarantee an improvement.

## Status

This repository is under active development. The initial implementation supports static analysis and a read-only SQLite adapter. PostgreSQL and MySQL adapters, the CLI, and a browser demo are not yet available.

## Install

```sh
npm install @cshanmukha777/querylens
```

## Quick start

```ts
import { QueryLens } from "@cshanmukha777/querylens";

const lens = new QueryLens({ dialect: "sqlite" });
const result = lens.analyze(`SELECT * FROM orders WHERE DATE(created_at) = '2026-11-22'`);

console.log(result.score, result.grade);
console.log(result.findings);
console.log(result.recommendations);
```

`analyze` is synchronous, parses one statement, and never executes SQL. Supported dialect selections are SQLite, PostgreSQL, and MySQL. Unsupported syntax and multiple statements are reported as errors rather than treated as a successful analysis.

## Current analysis signals

- `SELECT *` projection.
- `SELECT` without `WHERE` (informational only).
- `UPDATE` and `DELETE` without `WHERE`.
- Function-wrapped predicate columns.
- Leading-wildcard `LIKE` patterns.
- Several `OR` branches.
- Join count and nested query indicators.

Every recommendation is static guidance. Validate it against the intended semantics, schema, representative data, and the target engine's plan.

## Score

The deterministic structural score starts at 100 and subtracts 2 for each informational finding, 10 for each warning, and 30 for each critical finding, clamped to 0–100. Grades are A ≥90, B ≥80, C ≥70, D ≥60, and F below 60. This is not a speed or runtime score.

## Fingerprints and reports

```ts
const fingerprint = lens.fingerprint("SELECT id FROM users WHERE id = 10");
const json = lens.json(result);
const html = lens.html(result);
```

Fingerprints are truncated SHA-256 structural identifiers with literal values and source positions removed. They are useful for grouping common query shapes, not for security or identity proofs.

## CLI

After building or installing the package, run `querylens --help`. Current commands are:

```sh
querylens analyze ./queries.sql --dialect postgresql --format json
querylens fingerprint ./queries.sql --dialect sqlite
```

The CLI performs static analysis only. It does not open a database connection.

## Profiling

`SQLiteAdapter` wraps a prepared-statement compatible database handle and enables SQLite `query_only`. Open the database in read-only mode as well when profiling untrusted or public-facing workloads. Bind parameters rather than interpolating values.

```ts
import Database from "better-sqlite3";
import { Profiler, SQLiteAdapter } from "@cshanmukha777/querylens";

const db = new Database("sample.sqlite", { readonly: true, fileMustExist: true });
const profiler = new Profiler(new SQLiteAdapter(db));
const { record } = await profiler.profile("SELECT id FROM users WHERE id = ?", { parameters: [42] });
console.log(record.durationMs, record.rowCount, record.plan);
```

The duration is a measurement of this execution in the current environment and is not comparable without controlling hardware, cache state, data, and concurrency. SQLite plans come from non-executing `EXPLAIN QUERY PLAN`. PostgreSQL and MySQL profiling are not claimed as implemented yet.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run pack:check
```

## License

MIT. The project depends on `node-sql-parser` (Apache-2.0); see its upstream license for that dependency's terms.
