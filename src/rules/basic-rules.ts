import type { AnalysisContext, AnalysisRule, Finding } from "../types.js";

type AstNode = Record<string, unknown>;
const isObject = (value: unknown): value is AstNode => !!value && typeof value === "object" && !Array.isArray(value);

function visit(value: unknown, callback: (node: AstNode) => void): void {
  if (Array.isArray(value)) { for (const item of value) visit(item, callback); return; }
  if (!isObject(value)) return;
  callback(value);
  for (const child of Object.values(value)) visit(child, callback);
}

function visitPredicates(value: unknown, callback: (node: AstNode) => void): void {
  const visited = new Set<AstNode>();
  const visitClause = (clause: unknown): void => visit(clause, (node) => {
    if (visited.has(node)) return;
    visited.add(node);
    callback(node);
  });
  const findClauses = (current: unknown): void => {
    if (Array.isArray(current)) { for (const item of current) findClauses(item); return; }
    if (!isObject(current)) return;
    for (const [key, child] of Object.entries(current)) {
      if (key === "where" || key === "having" || key === "on") visitClause(child);
      findClauses(child);
    }
  };
  findClauses(value);
}

function finding(input: Omit<Finding, "confidence"> & { confidence?: number }): Finding {
  const { confidence = 0.9, ...rest } = input;
  return { ...rest, confidence };
}

export const selectStarRule: AnalysisRule = {
  id: "projection.select-star",
  analyze({ ast }) {
    const node = ast as AstNode;
    if (String(node.type).toLowerCase() !== "select") return [];
    const columns = node.columns;
    const found = columns === "*" || (Array.isArray(columns) && columns.some((item) => {
      if (!isObject(item) || !isObject(item.expr)) return false;
      return item.expr.column === "*";
    }));
    return found ? [finding({
      id: this.id, severity: "warning", title: "Avoid selecting every column",
      explanation: "The projection includes all columns, so the query requests fields whether or not the caller uses them.",
      whyItMatters: "Wider rows can increase I/O, memory use, and coupling to schema changes.",
      remediation: "List only the columns the application needs.",
      evidence: ["The parsed SELECT projection contains a wildcard."],
    })] : [];
  },
};

export const missingWhereRule: AnalysisRule = {
  id: "filter.missing-where",
  analyze({ ast }) {
    const node = ast as AstNode;
    const type = String(node.type).toLowerCase();
    if (type === "select" && node.where == null) return [finding({
      id: this.id, severity: "info", title: "SELECT has no WHERE clause",
      explanation: "This statement reads rows without an explicit filter.",
      whyItMatters: "A broad read may be intentional, but on a large relation it can examine many rows.",
      remediation: "Confirm that returning the full relation is intended; add a predicate only if product semantics require one.",
      confidence: 0.65, evidence: ["The SELECT AST has no WHERE expression."],
    })];
    if ((type === "update" || type === "delete") && node.where == null) return [finding({
      id: this.id, severity: "critical", title: `${type.toUpperCase()} has no WHERE clause`,
      explanation: `This ${type.toUpperCase()} statement has no row filter.`,
      whyItMatters: "It can affect every row in the target table.",
      remediation: "Add a predicate that identifies the intended rows, or use a deliberate transaction and review process for a table-wide change.",
      evidence: [`The parsed ${type.toUpperCase()} AST has no WHERE expression.`],
    })];
    return [];
  },
};

export const predicateRules: AnalysisRule = {
  id: "predicate.patterns",
  analyze(context: AnalysisContext) {
    const findings: Finding[] = [];
    let leadingWildcard = false;
    const wrappedColumns = new Set<string>();
    let orBranches = 0;
    visitPredicates(context.ast, (node) => {
      const kind = String(node.type ?? "").toLowerCase();
      if (kind === "binary_expr") {
        const operator = String(node.operator ?? "").toUpperCase();
        if (operator === "OR") orBranches += 1;
        if (operator === "LIKE" && isObject(node.right)) {
          const pattern = String(node.right.value ?? "");
          if (pattern.startsWith("%") || pattern.startsWith("_")) leadingWildcard = true;
        }
        for (const side of [node.left, node.right]) {
          if (!isObject(side) || String(side.type).toLowerCase() !== "function") continue;
          visit(side, (child) => {
            if (String(child.type).toLowerCase() !== "column_ref") return;
            const table = String(child.table ?? "");
            const column = String(child.column ?? "column");
            wrappedColumns.add(table ? `${table}.${column}` : column);
          });
        }
      }
    });
    if (wrappedColumns.size) {
      const columns = [...wrappedColumns];
      findings.push(finding({
      id: "predicate.function-on-column", severity: "warning", title: "Function applied to a filtered column",
      explanation: `A function is applied to ${columns.join(", ")} in a predicate.`,
      whyItMatters: "This form may prevent some engines from using a conventional index on the underlying column.",
      remediation: "Check whether an equivalent range predicate or a database-specific expression index fits the data type and semantics.",
      confidence: 0.8, evidence: columns.map((column) => `A predicate applies a function to ${column}.`),
      }));
    }
    if (leadingWildcard) findings.push(finding({
      id: "predicate.leading-wildcard-like", severity: "warning", title: "LIKE pattern begins with a wildcard",
      explanation: "The parsed LIKE pattern starts with a wildcard character.",
      whyItMatters: "A conventional B-tree index often cannot seek to a fixed prefix for this pattern.",
      remediation: "If product semantics allow it, use a prefix search or a database-specific text-search index.",
      confidence: 0.82, evidence: ["The LIKE pattern begins with `%` or `_`."],
    }));
    if (orBranches >= 3) findings.push(finding({
      id: "predicate.many-or-branches", severity: "info", title: "Predicate has several OR branches",
      explanation: `The expression tree contains ${orBranches} OR operators.`,
      whyItMatters: "Several alternatives can complicate selectivity estimates and index access decisions.",
      remediation: "Inspect the actual plan and consider whether the alternatives can be expressed more clearly without changing semantics.",
      confidence: 0.58, evidence: [`Counted ${orBranches} OR operators in the parsed expression tree.`],
    }));
    return findings;
  },
};

export const structuralRules: AnalysisRule = {
  id: "structure.complexity",
  analyze({ ast }) {
    const node = ast as AstNode;
    const type = String(node.type).toLowerCase();
    if (type !== "select") return [];
    const from = Array.isArray(node.from) ? node.from : [];
    const joins = from.filter((item) => isObject(item) && item.join != null).length;
    const nestedQueries: AstNode[] = [];
    visit(node.where, (child) => { if (String(child.type).toLowerCase() === "select") nestedQueries.push(child); });
    const out: Finding[] = [];
    if (joins > 4) out.push(finding({
      id: "joins.excessive-count", severity: "warning", title: "Query contains many joins",
      explanation: `The query has ${joins} join clauses.`, whyItMatters: "As join count grows, cardinality estimates and plan choices can become harder to validate.",
      remediation: "Review the joins against the intended result grain and inspect the database execution plan.",
      confidence: 0.68, evidence: [`Found ${joins} joined relations in the SELECT source list.`],
    }));
    if (nestedQueries.length) out.push(finding({
      id: "subquery.nested", severity: "info", title: "Nested query detected",
      explanation: `The WHERE expression contains ${nestedQueries.length} nested SELECT statement(s).`,
      whyItMatters: "Some nested forms are optimized well; others can be correlated or repeatedly evaluated.",
      remediation: "Check whether the plan shows repeated work and compare equivalent join or EXISTS formulations before changing the query.",
      confidence: 0.72, evidence: [`Found ${nestedQueries.length} nested SELECT node(s) in the WHERE tree.`],
    }));
    const outerAliases = new Set(from.filter(isObject).map((item) => String(item.as ?? item.table ?? "").toLowerCase()));
    const correlated = nestedQueries.some((subquery) => {
      let matched = false;
      visit(subquery, (child) => {
        if (String(child.type).toLowerCase() === "column_ref" && outerAliases.has(String(child.table ?? "").toLowerCase())) matched = true;
      });
      return matched;
    });
    if (correlated) out.push(finding({
      id: "subquery.correlated", severity: "warning", title: "Potential correlated subquery",
      explanation: "A nested query refers to an alias from the outer query.",
      whyItMatters: "A correlated subquery can depend on outer rows and may repeat work, depending on the database optimizer and plan.",
      remediation: "Inspect the actual plan and row counts; compare equivalent EXISTS or join forms only when their NULL and duplicate semantics match.",
      confidence: 0.76, evidence: ["A column reference inside the nested SELECT matches a relation alias in the outer SELECT."],
    }));
    return out;
  },
};

export const schemaIndexRule: AnalysisRule = {
  id: "index.schema-candidate",
  analyze({ ast, schema }) {
    if (!schema) return [];
    const node = ast as AstNode;
    const from = Array.isArray(node.from) ? node.from.filter(isObject) : [];
    const relations = new Map<string, string>();
    for (const relation of from) {
      const table = String(relation.table ?? "");
      if (!table) continue;
      relations.set(String(relation.as ?? table).toLowerCase(), table.toLowerCase());
    }
    const candidates = new Map<string, { table: string; column: string; evidence: string }>();
    const inspect = (value: unknown, source: string): void => visit(value, (expr) => {
      if (String(expr.type).toLowerCase() !== "binary_expr") return;
      const operator = String(expr.operator ?? "").toUpperCase();
      if (!["=", ">", ">=", "<", "<=", "IN", "LIKE"].includes(operator)) return;
      if (operator === "LIKE" && isObject(expr.right)) {
        const pattern = String(expr.right.value ?? "");
        if (pattern.startsWith("%") || pattern.startsWith("_")) return;
      }
      for (const side of [expr.left, expr.right]) {
        if (!isObject(side) || String(side.type).toLowerCase() !== "column_ref") continue;
        const alias = String(side.table ?? "").toLowerCase();
        const table = alias ? relations.get(alias) : relations.size === 1 ? [...relations.values()][0] : undefined;
        const column = String(side.column ?? "");
        if (table && column && column !== "*") candidates.set(`${table}.${column}`, { table, column, evidence: `${source} predicate compares ${table}.${column}.` });
      }
    });
    inspect(node.where, "WHERE");
    for (const relation of from) inspect(relation.on, "JOIN");
    const results: Finding[] = [];
    for (const candidate of candidates.values()) {
      const tableInfo = schema.tables.find((item) => item.name.toLowerCase() === candidate.table);
      if (!tableInfo || !tableInfo.columns.some((column) => column.toLowerCase() === candidate.column)) continue;
      const indexed = (tableInfo.indexes ?? []).some((index) => index.columns[0]?.toLowerCase() === candidate.column);
      if (indexed) continue;
      results.push(finding({
        id: "index.schema-candidate", severity: "info", title: `Review an index on ${tableInfo.name}.${candidate.column}`,
        explanation: "The schema snapshot confirms this column is used in a filter or join and is not the leading column of a known index.",
        whyItMatters: "An index may help some access patterns, but write cost, selectivity, table size, and the actual plan determine whether it is useful.",
        remediation: "Treat this as a candidate only; compare plans and workload costs before creating an index.",
        confidence: 0.55, evidence: [candidate.evidence, "No listed index begins with this column."],
      }));
    }
    return results;
  },
};

export const defaultRules: AnalysisRule[] = [selectStarRule, missingWhereRule, predicateRules, structuralRules, schemaIndexRule];
