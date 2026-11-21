# Contributing

## Development setup

Use Node.js 22.13 or later, then run:

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:package
npm run pack:check
```

The package smoke test creates and installs a temporary tarball; it does not publish it.

## Changes and tests

- Keep parser-specific AST handling behind `src/parser.ts` and add a focused fixture or test for dialect-sensitive changes.
- Keep static analysis separate from database execution. Findings should include evidence and limitations, and must not promise runtime improvements without measurements.
- Add SQLite integration cases using an in-memory database. Use explicit parameter binding in examples and tests.
- Do not list a database profiling adapter as supported until it has integration tests against that database.
- Update `README.md`, [`API.md`](API.md), and `CHANGELOG.md` when behavior or public APIs change.
- Keep dependencies small and check `npm audit` before adding or updating dependencies.

## Pull requests and releases

Use a conventional commit subject and describe user-visible changes, tests, and limitations in the pull request. Update the package version and changelog for a release candidate. Publishing to npm is a separate maintainer action and requires explicit authorization.

Never commit credentials, production query values, local database files, or generated build output.

Use conventional commit messages. Include no secrets, database files, or credentials in changes.
