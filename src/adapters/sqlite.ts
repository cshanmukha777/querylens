import { AdapterError } from "../errors.js";
import { parseSelectSql } from "../parser.js";
import type { PlanFinding, SqlAdapter, SqliteDatabaseLike } from "./adapter.js";
import type { SqlDialect } from "../types.js";

function assertReadOnlyStatement(sql: string): void {
  try {
    parseSelectSql(sql, "sqlite");
  } catch (cause) {
    throw new AdapterError("SQLiteAdapter accepts one SELECT statement only.", {
      cause,
    });
  }
}

export class SQLiteAdapter implements SqlAdapter {
  readonly dialect: SqlDialect = "sqlite";

  constructor(private readonly database: SqliteDatabaseLike) {
    if (
      !database ||
      typeof database.prepare !== "function" ||
      typeof database.pragma !== "function"
    ) {
      throw new AdapterError(
        "SQLiteAdapter requires a database handle with prepare() and pragma() support.",
      );
    }
    try {
      this.database.pragma("query_only = ON");
    } catch (cause) {
      throw new AdapterError(
        "SQLiteAdapter could not enable SQLite query_only mode.",
        { cause },
      );
    }
  }

  async execute<Row = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ) {
    assertReadOnlyStatement(sql);
    try {
      const rows = this.database.prepare(sql).all(...parameters) as Row[];
      return { rows, rowCount: rows.length };
    } catch (cause) {
      throw new AdapterError("SQLite query execution failed.", { cause });
    }
  }

  async explain(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<{ raw: unknown[]; findings: PlanFinding[] }> {
    assertReadOnlyStatement(sql);
    try {
      const raw = this.database
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all(...parameters) as Array<Record<string, unknown>>;
      const findings: PlanFinding[] = [];
      for (const row of raw) {
        const detail = String(row.detail ?? "");
        if (/\bSCAN\b/i.test(detail))
          findings.push({ kind: "table-scan", detail, confidence: 0.95 });
        if (/\bUSING (?:COVERING )?INDEX\b/i.test(detail))
          findings.push({ kind: "index-access", detail, confidence: 0.98 });
        if (/TEMP B-TREE/i.test(detail))
          findings.push({ kind: "temporary-sort", detail, confidence: 0.92 });
        if (/MATERIALIZE/i.test(detail))
          findings.push({ kind: "materialization", detail, confidence: 0.9 });
      }
      return { raw, findings };
    } catch (cause) {
      throw new AdapterError("SQLite EXPLAIN QUERY PLAN failed.", { cause });
    }
  }
}
