import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliDirectory = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(cliDirectory, "package.json"), "utf8"));
const directory = mkdtempSync(path.join(tmpdir(), "synch-cli-package-"));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const run = (args, cwd) => execFileSync(pnpm, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });

try {
  run(["pack", "--pack-destination", directory], cliDirectory);
  const archive = path.join(directory, readdirSync(directory).find((name) => name.endsWith(".tgz")));
  const packedManifest = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
  assert.equal(packedManifest.private, undefined);
  assert.equal(Object.keys(packedManifest.dependencies ?? {}).length, 0);
  const files = execFileSync("tar", ["-tf", archive], { encoding: "utf8" }).trim().split(/\r?\n/).filter((name) => !name.endsWith("/"));
  assert.deepEqual(files.sort(), ["package/dist/LICENSE", "package/README.md", "package/dist/THIRD_PARTY_LICENSES.txt", "package/dist/synch.js", "package/package.json"].sort());

  // Install outside the workspace, with scripts disabled and no registry access.
  // This exercises the packaged bin mapping rather than the source entrypoint.
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ private: true }));
  run(["add", archive, "--offline", "--ignore-scripts", "--config.manage-package-manager-versions=false"], directory);
  assert.equal(run(["exec", "synch", "--version"], directory).trim(), manifest.version);
  assert.match(run(["exec", "synch", "--help"], directory), /Usage:/);
  console.log(`Verified ${manifest.name}@${manifest.version}: isolated offline install, version, help, and package contents.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
