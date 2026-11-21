import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { SqlDialect } from "./types.js";
import { parseSql } from "./parser.js";

function normalizeAst(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeAst);
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const type = String(input.type ?? "").toLowerCase();
    for (const key of Object.keys(input).sort()) {
      if (key === "loc" || key === "comments" || key === "raw") continue;
      if ((key === "value" && /number|string|bool|null|hex|bit/.test(type))
        || (type === "param" && key === "value")
        || (type === "var" && key === "name")) {
        result[key] = "?";
      } else {
        result[key] = normalizeAst(input[key]);
      }
    }
    return result;
  }
  return value;
}

export function fingerprintSql(sql: string, dialect: SqlDialect): string {
  const ast = parseSql(sql, dialect);
  const canonical = JSON.stringify({ dialect, ast: normalizeAst(ast) });
  return bytesToHex(sha256(new TextEncoder().encode(canonical))).slice(0, 24);
}
