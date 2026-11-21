import { describe, expect, it } from "vitest";
import { parseCliArguments } from "../src/cli-args.js";

describe("CLI argument parsing", () => {
  it("shows help when no command is supplied", () => {
    expect(parseCliArguments([])).toBeNull();
    expect(parseCliArguments(["analyze", "--help"])).toBeNull();
  });

  it("parses analyze and fingerprint commands with supported options", () => {
    expect(parseCliArguments(["analyze", "queries.sql", "--dialect", "postgresql", "--format", "json"]))
      .toEqual({ command: "analyze", file: "queries.sql", dialect: "postgresql", format: "json" });
    expect(parseCliArguments(["fingerprint", "--dialect", "mysql", "queries.sql"]))
      .toEqual({ command: "fingerprint", file: "queries.sql", dialect: "mysql", format: "text" });
  });

  it.each([
    [["unknown", "queries.sql"], /Unknown command/],
    [["analyze"], /file path is required/],
    [["analyze", "queries.sql", "--dialect", "oracle"], /Unsupported dialect/],
    [["analyze", "queries.sql", "--format", "xml"], /Unsupported format/],
    [["analyze", "queries.sql", "--extra"], /Unknown option/],
    [["analyze", "queries.sql", "other.sql"], /exactly one SQL file/],
    [["analyze", "queries.sql", "--dialect"], /value is required/],
    [["fingerprint", "queries.sql", "--format", "json"], /only supported by the analyze command/],
  ] as const)("rejects invalid arguments %#", (args, message) => {
    expect(() => parseCliArguments(args)).toThrow(message);
  });
});
