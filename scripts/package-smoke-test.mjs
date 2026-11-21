import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "querylens-package-smoke-"),
);
const packDirectory = join(temporaryDirectory, "pack");
const installDirectory = join(temporaryDirectory, "install");
mkdirSync(packDirectory);
mkdirSync(installDirectory);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}:\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout;
}

try {
  const packed = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", packDirectory], root),
  )[0];
  assert.equal(packed.name, packageJson.name);
  assert.equal(packed.version, packageJson.version);

  const packageFiles = new Set(packed.files.map(({ path }) => path));
  for (const expected of [
    "API.md",
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "dist/cli.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/index.js",
  ]) {
    assert.ok(packageFiles.has(expected), `npm tarball is missing ${expected}`);
  }

  const archive = join(packDirectory, packed.filename);
  run(
    "npm",
    [
      "install",
      "--prefix",
      installDirectory,
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      archive,
    ],
    root,
  );

  const importCheck = `import { QueryLens } from ${JSON.stringify(packageJson.name)}; const result = new QueryLens({ dialect: "sqlite" }).analyze("SELECT id FROM users WHERE id = 1"); if (result.statementType !== "select") process.exit(1);`;
  run(
    process.execPath,
    ["--input-type=module", "-e", importCheck],
    installDirectory,
  );

  const queryFile = join(temporaryDirectory, "query.sql");
  writeFileSync(queryFile, "SELECT id FROM users WHERE id = 1;\n");
  const executable = join(
    installDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "querylens.cmd" : "querylens",
  );
  const cliOutput = run(
    executable,
    ["analyze", queryFile, "--format", "json"],
    installDirectory,
  );
  assert.equal(JSON.parse(cliOutput).statementType, "select");
  assert.match(run(executable, ["--help"], installDirectory), /Usage:/);

  const invalid = spawnSync(executable, ["analyze"], {
    cwd: installDirectory,
    encoding: "utf8",
  });
  assert.equal(
    invalid.status,
    2,
    "invalid CLI usage should exit with status 2",
  );
  process.stdout.write(
    `Package smoke test passed for ${packageJson.name}@${packageJson.version}.\n`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
