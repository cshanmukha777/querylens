import { analyzeSql } from "./analyzer.js";
import { fingerprintSql } from "./fingerprint.js";
import { assertSqlDialect } from "./parser.js";
import { toHtmlReport, toJsonReport } from "./reports.js";
import type { QueryLensOptions } from "./types.js";

export class QueryLens {
  private readonly options: QueryLensOptions;

  constructor(options: QueryLensOptions) {
    if (!options || typeof options !== "object") throw new TypeError("QueryLens options are required.");
    assertSqlDialect(options.dialect);
    this.options = options;
  }

  /** Synchronously parses and analyzes one SQL statement; it never executes SQL. */
  analyze(sql: string) {
    return analyzeSql(sql, this.options.dialect, {
      ...(this.options.schema ? { schema: this.options.schema } : {}),
      ...(this.options.customRules ? { rules: this.options.customRules } : {}),
    });
  }

  /** Returns a dialect-aware, literal-insensitive structural fingerprint. */
  fingerprint(sql: string): string {
    return fingerprintSql(sql, this.options.dialect);
  }

  json(result: ReturnType<QueryLens["analyze"]>): string { return toJsonReport(result); }
  html(result: ReturnType<QueryLens["analyze"]>): string { return toHtmlReport(result); }
}

export { analyzeSql, fingerprintSql, toHtmlReport, toJsonReport };
export { AdapterError, QueryLensError, SqlParseError, UnsupportedStatementError } from "./errors.js";
export { scoringMethodology, scoreFindings } from "./scoring.js";
export { SQLiteAdapter } from "./adapters/sqlite.js";
export type { PlanFinding, QueryResult, SqlAdapter, SqliteDatabaseLike } from "./adapters/adapter.js";
export { ProfileHistory, Profiler } from "./profiler.js";
export type { ProfileOptions, ProfileRecord } from "./profiler.js";
export type {
  AnalysisContext, AnalysisResult, AnalysisRule, ComplexityIndicators, Finding, QueryLensOptions,
  Recommendation, SchemaSnapshot, Severity, SourceLocation, SourcePosition, SqlDialect, StatementType,
  TableDefinition, IndexDefinition,
} from "./types.js";

// Keep the runtime export surface explicit while supporting downstream type imports.
export type { SqlDialect as Dialect } from "./types.js";
