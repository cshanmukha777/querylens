import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { AdapterError, analyzeSql, Profiler, QueryLens, SQLiteAdapter, SqlParseError, scoreFindings } from "../src/index.js";

describe("static SQL analysis", () => {
  const lens = new QueryLens({ dialect: "sqlite" });

  it("detects wildcard projection and records structural output", () => {
    const result = lens.analyze("SELECT * FROM users WHERE id = 7");
    expect(result.findings.map((item) => item.id)).toContain("projection.select-star");
    expect(result.complexity.projectionColumns).toBe(1);
    expect(result.score).toBe(90);
  });

  it("distinguishes a broad SELECT from an unfiltered destructive statement", () => {
    expect(lens.analyze("SELECT id FROM users").findings[0]?.severity).toBe("info");
    expect(lens.analyze("DELETE FROM users").findings[0]?.severity).toBe("critical");
  });

  it("identifies non-sargable functions and leading wildcard LIKE", () => {
    const findings = lens.analyze("SELECT id FROM users WHERE DATE(created_at) = '2026-01-01' OR name LIKE '%lee'").findings;
    expect(findings.map((item) => item.id)).toContain("predicate.function-on-column");
    expect(findings.map((item) => item.id)).toContain("predicate.leading-wildcard-like");
  });

  it("detects wrapped columns on either side of a predicate only", () => {
    const leftWrapped = lens.analyze("SELECT id FROM users WHERE DATE(created_at) = '2026-01-01'");
    const rightWrapped = lens.analyze("SELECT id FROM users WHERE id = DATE(created_at)");
    const projectionOnly = lens.analyze("SELECT DATE(created_at) = '2026-01-01' AS same_day FROM users");
    expect(leftWrapped.findings.map((item) => item.id)).toContain("predicate.function-on-column");
    expect(rightWrapped.findings.map((item) => item.id)).toContain("predicate.function-on-column");
    expect(projectionOnly.findings.map((item) => item.id)).not.toContain("predicate.function-on-column");
  });

  it("only raises index candidates when a supplied schema supports the signal", () => {
    const scoped = new QueryLens({ dialect: "sqlite", schema: { tables: [{ name: "users", columns: ["id", "email"], indexes: [] }] } });
    const findings = scoped.analyze("SELECT id FROM users WHERE email = 'a@example.test'").findings;
    expect(findings.map((item) => item.id)).toContain("index.schema-candidate");
    const suffixSearch = scoped.analyze("SELECT id FROM users WHERE email LIKE '%@example.test'").findings;
    expect(suffixSearch.map((item) => item.id)).not.toContain("index.schema-candidate");
    expect(suffixSearch.map((item) => item.id)).toContain("predicate.leading-wildcard-like");
    expect(lens.analyze("SELECT id FROM users WHERE email = 'a@example.test'").findings.map((item) => item.id)).not.toContain("index.schema-candidate");
  });

  it("fingerprints SQL structure while ignoring literal values and formatting", () => {
    expect(lens.fingerprint("SELECT id FROM users WHERE id = 10")).toBe(
      lens.fingerprint(" select id\nfrom users where id=50; "),
    );
    expect(lens.fingerprint("SELECT * FROM users WHERE id = 1 AND active = TRUE AND name = 'Ada'")).toBe(
      lens.fingerprint("SELECT * FROM users WHERE id = 2 AND active = FALSE AND name = 'Lin'")
    );
  });

  it("normalizes named and numbered bind parameter names", () => {
    expect(lens.fingerprint("SELECT id FROM users WHERE id = :userId")).toBe(
      lens.fingerprint("SELECT id FROM users WHERE id = :accountId"),
    );
    expect(lens.fingerprint("SELECT id FROM users WHERE id = $1")).toBe(
      lens.fingerprint("SELECT id FROM users WHERE id = $2"),
    );
  });

  it("rejects malformed and multi-statement input", () => {
    expect(() => lens.analyze("SELECT FROM")).toThrow(SqlParseError);
    expect(() => lens.analyze("SELECT id FROM users; SELECT id FROM orders")).toThrow(/one SQL statement/i);
  });

  it("validates SQL and dialect values at the runtime API boundary", () => {
    expect(() => analyzeSql(42 as unknown as string, "sqlite")).toThrow("SQL must be a string");
    expect(() => analyzeSql("SELECT 1", "oracle" as never)).toThrow("dialect must be sqlite, postgresql, or mysql");
    expect(() => new QueryLens(undefined as never)).toThrow("QueryLens options are required");
  });

  it("uses deterministic, documented severity weights", () => {
    const result = scoreFindings([
      { id: "i", severity: "info", title: "i", explanation: "", whyItMatters: "", confidence: 1, remediation: "", evidence: [] },
      { id: "w", severity: "warning", title: "w", explanation: "", whyItMatters: "", confidence: 1, remediation: "", evidence: [] },
    ]);
    expect(result).toEqual({ score: 88, grade: "B" });
  });

  it("escapes generated HTML report content", () => {
    const unsafeLens = new QueryLens({ dialect: "sqlite", customRules: [{
      id: "test.unsafe", analyze: () => [{ id: "test.unsafe", severity: "warning", title: "<script>",
        explanation: "<script>", whyItMatters: "", confidence: 0.5, remediation: "<script>", evidence: [] }],
    }] });
    const html = unsafeLens.html(unsafeLens.analyze("SELECT id FROM users"));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("SQLite profiling", () => {
  it("profiles a parameterized read and includes a real SQLite plan", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO users (name) VALUES ('Ada')");
    const profiler = new Profiler(new SQLiteAdapter(db));
    const { record, rows } = await profiler.profile("SELECT name FROM users WHERE id = ?", { parameters: [1] });
    expect(rows).toEqual([{ name: "Ada" }]);
    expect(record.status).toBe("success");
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(record.plan).toBeTruthy();
    expect(profiler.getHistory()).toHaveLength(1);
    db.close();
  });

  it("rejects non-read operations", async () => {
    const db = new Database(":memory:");
    const adapter = new SQLiteAdapter(db);
    await expect(adapter.execute("DELETE FROM users")).rejects.toThrow("SELECT statement only");
    await expect(adapter.execute("EXPLAIN SELECT 1")).rejects.toThrow("SELECT statement only");
    await expect(adapter.execute("WITH doomed AS (SELECT 1) DELETE FROM users")).rejects.toThrow("SELECT statement only");
    db.close();
  });

  it("accepts commented and CTE SELECT statements", async () => {
    const db = new Database(":memory:");
    const adapter = new SQLiteAdapter(db);
    const result = await adapter.execute("/* leading */ -- comment\nWITH one AS (SELECT 1 AS value) SELECT value FROM one");
    expect(result.rows).toEqual([{ value: 1 }]);
    db.close();
  });

  it("requires query_only support on the injected database handle", () => {
    expect(() => new SQLiteAdapter({ prepare: () => ({ all: () => [], run: () => ({ changes: 0, lastInsertRowid: 0 }) }) } as never))
      .toThrow(AdapterError);
  });
});
