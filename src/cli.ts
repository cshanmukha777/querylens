#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { analyzeSql } from "./analyzer.js";
import { CliUsageError, parseCliArguments } from "./cli-args.js";
import { fingerprintSql } from "./fingerprint.js";

const usage = `QueryLens — static SQL structure analysis\n\nUsage:\n  querylens analyze <file.sql> [--dialect sqlite|postgresql|mysql] [--format text|json]\n  querylens fingerprint <file.sql> [--dialect sqlite|postgresql|mysql]\n  querylens --help\n`;

async function main(args: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseCliArguments(args);
  } catch (error) {
    process.stderr.write(
      `${error instanceof CliUsageError ? error.message : "Invalid command line arguments."}\n${usage}`,
    );
    return 2;
  }
  if (!parsed) {
    process.stdout.write(usage);
    return 0;
  }

  try {
    const sql = await readFile(parsed.file, "utf8");
    if (parsed.command === "fingerprint") {
      process.stdout.write(`${fingerprintSql(sql, parsed.dialect)}\n`);
      return 0;
    }
    const result = analyzeSql(sql, parsed.dialect);
    if (parsed.format === "json")
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(
        `QueryLens structural score: ${result.score}/100 (${result.grade})\n`,
      );
      process.stdout.write(
        `Dialect: ${result.dialect} · Statement: ${result.statementType}\n`,
      );
      for (const item of result.findings)
        process.stdout.write(
          `\n[${item.severity.toUpperCase()}] ${item.title}\n${item.explanation}\n${item.remediation}\n`,
        );
      if (result.findings.length === 0)
        process.stdout.write(
          "No configured static findings. This does not imply a good runtime plan.\n",
        );
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "QueryLens failed."}\n`,
    );
    return 1;
  }
}

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
