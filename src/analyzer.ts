import { fingerprintSql } from "./fingerprint.js";
import { assertSupportedStatement, parseSql, type SqlAst } from "./parser.js";
import { scoreFindings } from "./scoring.js";
import { defaultRules } from "./rules/basic-rules.js";
import type {
  AnalysisContext,
  AnalysisResult,
  AnalysisRule,
  AnalyzeOptions,
  ComplexityIndicators,
  Finding,
  Recommendation,
  SqlDialect,
} from "./types.js";

function sourceLocation(value: unknown): Finding["location"] {
  if (!value || typeof value !== "object") return undefined;
  const loc = (value as Record<string, unknown>).loc;
  if (!loc || typeof loc !== "object") return undefined;
  const range = loc as Record<string, unknown>;
  const point = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return undefined;
    const p = candidate as Record<string, unknown>;
    if (
      typeof p.offset !== "number" ||
      typeof p.line !== "number" ||
      typeof p.column !== "number"
    )
      return undefined;
    return { offset: p.offset, line: p.line, column: p.column };
  };
  const start = point(range.start);
  const end = point(range.end);
  return start && end ? { start, end } : undefined;
}

function countComplexity(ast: SqlAst): ComplexityIndicators {
  const node = ast as Record<string, unknown>;
  let nestedQueries = 0;
  let booleanBranches = 0;
  let hasAggregation = node.groupby != null || node.having != null;
  const visit = (value: unknown, root = false): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const current = value as Record<string, unknown>;
    if (!root && String(current.type).toLowerCase() === "select")
      nestedQueries += 1;
    if (
      String(current.type).toLowerCase() === "binary_expr" &&
      String(current.operator).toUpperCase() === "OR"
    )
      booleanBranches += 1;
    if (String(current.type).toLowerCase() === "aggr_func")
      hasAggregation = true;
    for (const child of Object.values(current)) visit(child);
  };
  visit(ast, true);
  const from = Array.isArray(node.from) ? node.from : [];
  const columns = Array.isArray(node.columns)
    ? node.columns.length
    : node.columns == null
      ? 0
      : 1;
  return {
    joins: from.filter(
      (item) => !!item && typeof item === "object" && "join" in item,
    ).length,
    nestedQueries,
    booleanBranches,
    projectionColumns: columns,
    hasAggregation,
    hasOrdering: node.orderby != null,
  };
}

function recommendationsFrom(findings: Finding[]): Recommendation[] {
  return findings.map((item) => ({
    title: item.remediation,
    description: item.explanation,
    evidence: item.evidence,
    confidence: item.confidence,
    limitations:
      "This is static guidance. Confirm semantic equivalence and validate with your database's actual execution plan and representative data.",
  }));
}

export function analyzeSql(
  sql: string,
  dialect: SqlDialect,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const ast = parseSql(sql, dialect);
  const statement = assertSupportedStatement(ast);
  const context: AnalysisContext = {
    sql,
    dialect,
    ast,
    statementType: statement,
    ...(options.schema ? { schema: options.schema } : {}),
  };
  const rules = [...defaultRules, ...(options.rules ?? [])];
  const loc = sourceLocation(ast);
  const findings = rules.flatMap((rule) =>
    rule
      .analyze(context)
      .map((item) => (loc ? { ...item, location: loc } : item)),
  );
  const counts = {
    info: findings.filter((item) => item.severity === "info").length,
    warning: findings.filter((item) => item.severity === "warning").length,
    critical: findings.filter((item) => item.severity === "critical").length,
  };
  const { score, grade } = scoreFindings(findings);
  return {
    dialect,
    statementType: statement,
    score,
    grade,
    fingerprint: fingerprintSql(sql, dialect),
    findings,
    recommendations: recommendationsFrom(findings),
    complexity: countComplexity(ast),
    summary: counts,
  };
}
