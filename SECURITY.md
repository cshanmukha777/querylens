# Security policy

Report suspected vulnerabilities privately through GitHub Security Advisories for this repository. Do not include credentials, personal data, or production query parameter values in public issues.

QueryLens static analysis parses SQL but does not execute it. Database adapters execute statements supplied by the application; callers must use parameterized queries and enforce their own authorization. The SQLite adapter enables `query_only`, but public applications should also open a read-only connection and must never pass arbitrary visitor SQL to a database. Use curated query identifiers for hosted demo profiling.
