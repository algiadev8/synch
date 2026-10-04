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
const run = (args, cwd) => execFileSync(pnpm, args, {
  cwd,
  encoding: "utf8",
  shell: process.platform === "win32",
  env: { ...process.env, XDG_CONFIG_HOME: path.join(directory, "config") },
});

try {
  // Release CI passes the exact archive that will be uploaded and published.
  // Local checks build a fresh archive when no path is provided.
  let archive;
  if (process.argv[2]) {
    archive = path.resolve(cliDirectory, process.argv[2]);
  } else {
    run(["pack", "--pack-destination", directory], cliDirectory);
    archive = path.join(directory, readdirSync(directory).find((name) => name.endsWith(".tgz")));
  }
  const packedManifest = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
  assert.notEqual(packedManifest.private, true);
  assert.equal(packedManifest.name, manifest.name);
  assert.equal(packedManifest.version, manifest.version);
  assert.equal(Object.keys(packedManifest.dependencies ?? {}).length, 0);
  const files = execFileSync("tar", ["-tf", archive], { encoding: "utf8" }).trim().split(/\r?\n/).filter((name) => !name.endsWith("/"));
  assert.deepEqual(files.sort(), ["package/dist/LICENSE", "package/README.md", "package/dist/THIRD_PARTY_LICENSES.txt", "package/dist/synch.js", "package/package.json"].sort());

  // Install outside the workspace, with scripts disabled and no registry access.
  // This exercises the packaged bin mapping rather than the source entrypoint.
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ private: true }));
  run(["add", archive, "--offline", "--ignore-scripts", "--config.manage-package-manager-versions=false"], directory);
  assert.equal(run(["exec", "synch", "--version"], directory).trim(), manifest.version);
  assert.match(run(["exec", "synch", "--help"], directory), /Usage:/);
  // Exercise application initialization too, with isolated credentials and no
  // signed-in session, so this never contacts an API or touches a real vault.
  const status = run(["exec", "synch", "status", "--vault", directory], directory);
  assert.match(status, /Account: not signed in/);
  assert.match(status, /Remote vault: not connected/);
  console.log(`Verified ${manifest.name}@${manifest.version}: isolated offline install, version, help, status, and package contents.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
