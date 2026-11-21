import type { SqlDialect } from "../types.js";

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

export interface SqlAdapter {
  readonly dialect: SqlDialect;
  execute<Row = Record<string, unknown>>(sql: string, parameters?: readonly unknown[]): Promise<QueryResult<Row>>;
  explain?(sql: string, parameters?: readonly unknown[]): Promise<unknown>;
}

/** Driver-neutral shape used by SQLiteAdapter. Create read-only handles for public demos. */
export interface SqliteDatabaseLike {
  prepare(sql: string): {
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
  pragma(source: string): unknown;
}

export interface PlanFinding {
  kind: "table-scan" | "index-access" | "temporary-sort" | "materialization";
  detail: string;
  confidence: number;
}
