# Changelog

## 0.1.1 — Unreleased

This is a release candidate prepared locally and on GitHub. It has not been published to npm.

### Added

- Public API reference, contribution instructions, GitHub issue forms, and a pull request template.
- Runtime validation for API and CLI inputs, with an installed-package and executable smoke test.
- PostgreSQL/MySQL parser coverage and SQLite integration cases for read-only behavior.

### Changed

- Fingerprints now ignore bind parameter names as well as literal values.
- Predicate analysis checks both sides of comparisons, recognizes casts, and avoids suggesting B-tree indexes for leading-wildcard `LIKE` searches. Aggregate complexity includes aggregate functions without `GROUP BY`.
- SQLite execution and profiling accept only one parsed `SELECT`; profiling preserves successful rows when plan inspection fails.
- Coverage thresholds and CI checks now include formatting, dependency audit, build, package installation, and CLI execution.

### Fixed

- Updated the development lockfile to a non-vulnerable `esbuild` release.
- Corrected package installation examples and feature status in the README.

## 0.1.0

- Initial development release: dialect-aware static analysis, fingerprints, deterministic scoring, JSON/HTML reports, and a read-only SQLite adapter with profile history.
