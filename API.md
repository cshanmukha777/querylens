# QueryLens API

QueryLens requires Node.js 22.13 or later. The package analyzes one SQL statement at a time. Static analysis does not connect to or execute statements.

## Static analysis

```ts
import { QueryLens } from "@shanmukha_npm/querylens";

const lens = new QueryLens({ dialect: "sqlite" });
const result = lens.analyze("SELECT id FROM users WHERE id = ?");

console.log(result.score, result.grade);
console.log(result.findings);
```

`QueryLens` options:

| Option        | Type                                  | Description                                                                                  |
| ------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `dialect`     | `"sqlite" \| "postgresql" \| "mysql"` | SQL parser dialect. This does not imply a database profiling adapter exists for that engine. |
| `schema`      | `SchemaSnapshot`                      | Optional table, column, and index facts used for cautious index candidate findings.          |
| `customRules` | `AnalysisRule[]`                      | Extra synchronous rules that return findings.                                                |

`lens.analyze(sql)` returns an `AnalysisResult` with the dialect, recognized statement type, static score and grade, fingerprint, findings, recommendations, structural complexity indicators, and severity counts. `analyzeSql(sql, dialect, options?)` provides the same analysis without constructing a `QueryLens` instance; its `options.rules` property accepts custom rules.

The built-in checks report wildcard projections, statements without a filter, function- or cast-wrapped predicate columns, leading-wildcard `LIKE` patterns, multiple `OR` branches, complex joins and nested queries, and candidate indexes when a schema snapshot is supplied. These signals do not prove that a query is slow or that a rewrite will be faster. Check semantics and inspect plans with representative data.

The score starts at 100 and subtracts 2 for each `info`, 10 for each `warning`, and 30 for each `critical` finding, with a 0–100 clamp. The result is a structural indicator, not a runtime estimate. `scoringMethodology` exports the same description; `scoreFindings(findings)` applies the weights directly.

## Fingerprints and reports

```ts
import {
  fingerprintSql,
  toHtmlReport,
  toJsonReport,
} from "@shanmukha_npm/querylens";

const fingerprint = fingerprintSql(
  "SELECT id FROM users WHERE id = 42",
  "sqlite",
);
const json = toJsonReport(result);
const html = toHtmlReport(result);
```

Fingerprints are 24-character SHA-256 prefixes over normalized parser structure. Literal values and bind parameter names are ignored; dialect remains part of the input. Fingerprints are grouping identifiers, not query identities or security tokens. The HTML report escapes generated text before inserting it into the document.

## SQLite profiling

Install a SQLite driver separately. QueryLens does not include one as a runtime dependency.

```sh
npm install better-sqlite3
```

```ts
import Database from "better-sqlite3";
import { Profiler, SQLiteAdapter } from "@shanmukha_npm/querylens";

const db = new Database("sample.sqlite", {
  readonly: true,
  fileMustExist: true,
});
const profiler = new Profiler(new SQLiteAdapter(db));
const { record, rows } = await profiler.profile(
  "SELECT id FROM users WHERE id = ?",
  { parameters: [42] },
);

console.log(rows, record.durationMs, record.rowCount, record.plan);
db.close();
```

`SQLiteAdapter` requires a database handle with `prepare()` and `pragma()` methods. It enables `query_only`, accepts one parsed `SELECT` statement, and obtains plans using `EXPLAIN QUERY PLAN`. Also open files read-only for untrusted or public-facing workloads. Do not pass arbitrary visitor SQL to a database; parameterize values and enforce application-level authorization.

`Profiler.profile` returns a `ProfileResult` containing rows and a `ProfileRecord`. If query execution succeeds but plan inspection fails, the record remains `success` and has a generic `planError` message. Query execution duration excludes plan inspection. A supplied `AbortSignal` is checked before and after execution; it cannot interrupt an in-progress synchronous SQLite query.

`ProfileHistory` keeps a bounded in-memory list of records (100 by default). It does not persist history between processes. The only built-in database adapter is SQLite. PostgreSQL and MySQL support is limited to static SQL parsing and analysis.

## CLI

The package installs a `querylens` executable:

```sh
querylens analyze ./query.sql --dialect sqlite --format json
querylens fingerprint ./query.sql --dialect postgresql
querylens --help
```

`--format` is available only for `analyze` and accepts `text` or `json`. The CLI reads a local SQL file and never opens a database connection. It exits with status 0 on success, 2 for command-line usage errors, and 1 for file, parse, or analysis failures.

## Public errors

- `SqlParseError`: SQL is empty or cannot be parsed for the selected dialect.
- `UnsupportedStatementError`: a statement type or operation is not supported in that API, or multiple statements were supplied.
- `AdapterError`: a database adapter failed, or its safety requirements were not met.

All three extend `QueryLensError`. Driver errors are available as `cause` where the operation wraps them.
