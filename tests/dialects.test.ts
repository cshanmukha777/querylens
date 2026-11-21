import { describe, expect, it } from "vitest";
import { analyzeSql, QueryLens, SqlParseError } from "../src/index.js";

describe("dialect-aware SQL parsing", () => {
  it("parses PostgreSQL positional parameters", () => {
    const result = analyzeSql("SELECT id FROM users WHERE id = $1", "postgresql");
    expect(result.dialect).toBe("postgresql");
    expect(result.statementType).toBe("select");
  });

  it("parses MySQL quoted identifiers and placeholders", () => {
    const result = analyzeSql("SELECT `id` FROM `users` WHERE `id` = ?", "mysql");
    expect(result.dialect).toBe("mysql");
    expect(result.statementType).toBe("select");
  });

  it("keeps fingerprints dialect-aware", () => {
    const postgres = new QueryLens({ dialect: "postgresql" }).fingerprint("SELECT id FROM users WHERE id = 1");
    const mysql = new QueryLens({ dialect: "mysql" }).fingerprint("SELECT id FROM users WHERE id = 1");
    expect(postgres).not.toBe(mysql);
  });

  it("reports parser failures for unsupported dialect syntax", () => {
    expect(() => analyzeSql("SELECT * FROM", "postgresql")).toThrow(SqlParseError);
  });
});
