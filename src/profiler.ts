import { AdapterError } from "./errors.js";
import { fingerprintSql } from "./fingerprint.js";
import { parseSelectSql } from "./parser.js";
import type { SqlAdapter } from "./adapters/adapter.js";
import type { SqlDialect } from "./types.js";

export interface ProfileOptions {
  parameters?: readonly unknown[];
  signal?: AbortSignal;
}

export interface ProfileRecord {
  timestamp: string;
  dialect: SqlDialect;
  fingerprint: string;
  durationMs: number;
  rowCount: number | null;
  status: "success" | "error";
  plan?: unknown;
  planError?: string;
}

export class ProfileHistory {
  private readonly entries: ProfileRecord[] = [];
  constructor(private readonly capacity = 100) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("History capacity must be a positive integer.");
  }
  add(record: ProfileRecord): void {
    this.entries.push(record);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
  }
  list(): ProfileRecord[] { return this.entries.map((record) => ({ ...record })); }
}

export class Profiler {
  constructor(private readonly adapter: SqlAdapter, private readonly history = new ProfileHistory()) {}

  async profile(sql: string, options: ProfileOptions = {}): Promise<{ record: ProfileRecord; rows: unknown[] }> {
    if (options.signal?.aborted) throw new AdapterError("Profiling was cancelled before execution.");
    parseSelectSql(sql, this.adapter.dialect);
    const fingerprint = fingerprintSql(sql, this.adapter.dialect);
    const start = performance.now();
    try {
      const result = await this.adapter.execute(sql, options.parameters ?? []);
      if (options.signal?.aborted) throw new AdapterError("Profiling was cancelled after execution.");
      let plan: unknown;
      let planError: string | undefined;
      if (this.adapter.explain) {
        try {
          plan = await this.adapter.explain(sql, options.parameters ?? []);
        } catch {
          planError = "Execution plan inspection failed.";
        }
      }
      const record: ProfileRecord = {
        timestamp: new Date().toISOString(), dialect: this.adapter.dialect, fingerprint,
        durationMs: Number((performance.now() - start).toFixed(3)), rowCount: result.rowCount, status: "success",
        ...(plan !== undefined ? { plan } : {}),
        ...(planError ? { planError } : {}),
      };
      this.history.add(record);
      return { record, rows: result.rows };
    } catch (cause) {
      const record: ProfileRecord = {
        timestamp: new Date().toISOString(), dialect: this.adapter.dialect, fingerprint,
        durationMs: Number((performance.now() - start).toFixed(3)), rowCount: null, status: "error",
      };
      this.history.add(record);
      if (cause instanceof AdapterError) throw cause;
      throw new AdapterError("Query profiling failed.", { cause });
    }
  }

  getHistory(): ProfileRecord[] { return this.history.list(); }
}
