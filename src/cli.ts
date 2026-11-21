#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { analyzeSql } from "./analyzer.js";
import { fingerprintSql } from "./fingerprint.js";
import type { SqlDialect } from "./types.js";

const usage = `QueryLens — static SQL structure analysis\n\nUsage:\n  querylens analyze <file.sql> [--dialect sqlite|postgresql|mysql] [--format text|json]\n  querylens fingerprint <file.sql> [--dialect sqlite|postgresql|mysql]\n  querylens --help\n`;

function option(args: string[], flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? "" : fallback;
}

function parseDialect(value: string): SqlDialect {
  if (value === "sqlite" || value === "postgresql" || value === "mysql") return value;
  throw new Error(`Unsupported dialect: ${value}`);
}

async function main(args: string[]): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") { process.stdout.write(usage); return 0; }
  const command = args[0];
  if (command !== "analyze" && command !== "fingerprint") { process.stderr.write(usage); return 2; }
  const file = args[1];
  if (!file || file.startsWith("--")) { process.stderr.write("A SQL file path is required.\n"); return 2; }
  try {
    const dialect = parseDialect(option(args, "--dialect", "sqlite"));
    const sql = await readFile(file, "utf8");
    if (command === "fingerprint") {
      process.stdout.write(`${fingerprintSql(sql, dialect)}\n`);
      return 0;
    }
    const result = analyzeSql(sql, dialect);
    if (option(args, "--format", "text") === "json") process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(`QueryLens structural score: ${result.score}/100 (${result.grade})\n`);
      process.stdout.write(`Dialect: ${result.dialect} · Statement: ${result.statementType}\n`);
      for (const item of result.findings) process.stdout.write(`\n[${item.severity.toUpperCase()}] ${item.title}\n${item.explanation}\n${item.remediation}\n`);
      if (result.findings.length === 0) process.stdout.write("No configured static findings. This does not imply a good runtime plan.\n");
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "QueryLens failed."}\n`);
    return 1;
  }
}

void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
