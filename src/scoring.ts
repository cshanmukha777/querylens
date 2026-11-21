import type { Finding } from "./types.js";

const penalty: Record<Finding["severity"], number> = {
  info: 2,
  warning: 10,
  critical: 30,
};

export function scoreFindings(findings: readonly Finding[]): {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
} {
  for (const item of findings) {
    if (!Object.hasOwn(penalty, item.severity)) {
      throw new TypeError(
        `Unsupported finding severity: ${String(item.severity)}`,
      );
    }
  }
  const score = Math.max(
    0,
    Math.min(
      100,
      100 - findings.reduce((total, item) => total + penalty[item.severity], 0),
    ),
  );
  const grade =
    score >= 90
      ? "A"
      : score >= 80
        ? "B"
        : score >= 70
          ? "C"
          : score >= 60
            ? "D"
            : "F";
  return { score, grade };
}

export const scoringMethodology =
  "Start at 100; subtract 2 per info finding, 10 per warning, and 30 per critical finding; clamp to 0–100. Grades: A ≥90, B ≥80, C ≥70, D ≥60, F <60. The score describes static structural signals and is not a runtime or speed estimate.";
