import type { AnalysisResult } from "./types.js";

export function toJsonReport(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function toHtmlReport(result: AnalysisResult): string {
  const rows = result.findings
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.severity.toUpperCase())}: ${escapeHtml(item.title)}</strong><p>${escapeHtml(item.explanation)}</p><p>${escapeHtml(item.remediation)}</p></li>`,
    )
    .join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>QueryLens report</title><style>body{font:16px system-ui;max-width:850px;margin:3rem auto;padding:0 1rem;color:#17202a}h1{font-size:1.6rem}li{margin:1rem 0;padding:1rem;border:1px solid #cbd5e1}p{line-height:1.5}</style><main><h1>QueryLens static analysis</h1><p>Structural score: ${result.score}/100 (${result.grade}). This score is not a runtime measurement.</p><p>Dialect: ${escapeHtml(result.dialect)} · Fingerprint: <code>${escapeHtml(result.fingerprint)}</code></p><ul>${rows || "<li>No findings.</li>"}</ul></main></html>`;
}
