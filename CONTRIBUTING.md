# Contributing

1. Use a supported Node.js LTS release and run `npm ci`.
2. Keep parser-specific AST handling behind `src/parser.ts` and write a fixture or test for each dialect-sensitive change.
3. Keep static analysis separate from database execution. Recommendations must include evidence and limitations.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run pack:check` before opening a pull request.
5. Do not add a database adapter to the supported list until it has integration tests against that database.

Use conventional commit messages. Include no secrets, database files, or credentials in changes.
