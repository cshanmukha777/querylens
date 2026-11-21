import type { SqlDialect } from "./types.js";

export interface CliArguments {
  command: "analyze" | "fingerprint";
  file: string;
  dialect: SqlDialect;
  format: "text" | "json";
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function parseDialect(value: string): SqlDialect {
  if (value === "sqlite" || value === "postgresql" || value === "mysql") return value;
  throw new CliUsageError(`Unsupported dialect: ${value}`);
}

export function parseCliArguments(args: readonly string[]): CliArguments | null {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return null;

  const command = args[0];
  if (command !== "analyze" && command !== "fingerprint") {
    throw new CliUsageError(`Unknown command: ${command ?? ""}`);
  }

  let file: string | undefined;
  let dialect: SqlDialect = "sqlite";
  let format: CliArguments["format"] = "text";
  const seen = new Set<string>();

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) throw new CliUsageError("Invalid command line arguments.");
    if (argument === "--dialect" || argument === "--format") {
      if (seen.has(argument)) throw new CliUsageError(`${argument} can only be supplied once.`);
      seen.add(argument);
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new CliUsageError(`A value is required after ${argument}.`);
      index += 1;

      if (argument === "--dialect") dialect = parseDialect(value);
      else {
        if (command !== "analyze") throw new CliUsageError("--format is only supported by the analyze command.");
        if (value !== "text" && value !== "json") throw new CliUsageError(`Unsupported format: ${value}`);
        format = value;
      }
      continue;
    }

    if (argument.startsWith("-")) throw new CliUsageError(`Unknown option: ${argument}`);
    if (file) throw new CliUsageError("Provide exactly one SQL file path.");
    file = argument;
  }

  if (!file) throw new CliUsageError("A SQL file path is required.");
  return { command, file, dialect, format };
}
