import parserModule from "node-sql-parser";
import { SqlParseError, UnsupportedStatementError } from "./errors.js";
import type { SqlDialect, StatementType } from "./types.js";

export type SqlAst = Record<string, unknown> & { type?: string; loc?: unknown };

const parserDatabase: Record<SqlDialect, string> = {
  sqlite: "Sqlite",
  postgresql: "Postgresql",
  mysql: "MySQL",
};

export function parseSql(sql: string, dialect: SqlDialect): SqlAst {
  if (!sql.trim()) throw new SqlParseError("SQL cannot be empty.");

  const parser = new parserModule.Parser();
  let ast: unknown;
  try {
    ast = parser.astify(sql, {
      database: parserDatabase[dialect],
      parseOptions: { includeLocations: true },
    });
  } catch (cause) {
    throw new SqlParseError("SQL could not be parsed for the selected dialect.", { cause });
  }

  if (Array.isArray(ast)) {
    if (ast.length !== 1) {
      throw new UnsupportedStatementError("Analyze one SQL statement at a time.");
    }
    ast = ast[0];
  }
  if (!ast || typeof ast !== "object") {
    throw new SqlParseError("The SQL parser returned no statement.");
  }

  return ast as SqlAst;
}

export function statementType(ast: SqlAst): StatementType {
  const type = String(ast.type ?? "unknown").toLowerCase();
  return type === "select" || type === "insert" || type === "update" || type === "delete"
    ? type
    : "unknown";
}

export function assertSupportedStatement(ast: SqlAst): StatementType {
  const type = statementType(ast);
  if (type === "unknown") {
    throw new UnsupportedStatementError(`Statement type "${String(ast.type)}" is not supported.`);
  }
  return type;
}
