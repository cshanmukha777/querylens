export type SqlDialect = "sqlite" | "postgresql" | "mysql";
export type Severity = "info" | "warning" | "critical";
export type StatementType = "select" | "insert" | "update" | "delete" | "unknown";

export interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

export interface SourceLocation {
  start: SourcePosition;
  end: SourcePosition;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  explanation: string;
  whyItMatters: string;
  confidence: number;
  remediation: string;
  evidence: string[];
  location?: SourceLocation;
}

export interface ComplexityIndicators {
  joins: number;
  nestedQueries: number;
  booleanBranches: number;
  projectionColumns: number;
  hasAggregation: boolean;
  hasOrdering: boolean;
}

export interface Recommendation {
  title: string;
  description: string;
  evidence: string[];
  confidence: number;
  limitations: string;
}

export interface AnalysisResult {
  dialect: SqlDialect;
  statementType: StatementType;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  fingerprint: string;
  findings: Finding[];
  recommendations: Recommendation[];
  complexity: ComplexityIndicators;
  summary: { info: number; warning: number; critical: number };
}

export interface QueryLensOptions {
  dialect: SqlDialect;
  /** Optional schema facts used to make index guidance less speculative. */
  schema?: SchemaSnapshot;
  customRules?: AnalysisRule[];
}

export interface AnalyzeOptions {
  schema?: SchemaSnapshot;
  rules?: AnalysisRule[];
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface TableDefinition {
  name: string;
  columns: string[];
  indexes?: IndexDefinition[];
}

export interface SchemaSnapshot {
  tables: TableDefinition[];
}

export interface AnalysisContext {
  sql: string;
  dialect: SqlDialect;
  ast: unknown;
  statementType: StatementType;
  schema?: SchemaSnapshot;
}

export interface AnalysisRule {
  id: string;
  analyze(context: AnalysisContext): Finding[];
}
