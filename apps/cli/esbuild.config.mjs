import esbuild from "esbuild";
import { isBuiltin } from "node:module";
import { chmod, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const result = await esbuild.build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/synch.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  metafile: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});

// The published CLI must run without installing private workspace packages or
// third-party dependencies. Fail the build if a non-builtin import escapes.
for (const output of Object.values(result.metafile.outputs)) {
  for (const imported of output.imports) {
    if (imported.external && !isBuiltin(imported.path)) {
      throw new Error(`Unbundled runtime dependency: ${imported.path}`);
    }
  }
}

// Preserve license notices for packages incorporated into the single bundle.
const notices = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes("node_modules/")) continue;
  let directory = path.dirname(path.resolve(input));
  while (directory !== path.dirname(directory)) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      directory = path.dirname(directory);
      continue;
    }
    const key = `${manifest.name}@${manifest.version}`;
    if (!notices.has(key)) {
      const files = (await readdir(directory)).filter((name) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name)).sort();
      if (files.length === 0) throw new Error(`Missing bundled dependency license: ${key}`);
      const texts = await Promise.all(files.map((name) => readFile(path.join(directory, name), "utf8")));
      notices.set(key, `${key}\n${texts.join("\n")}`);
    }
    break;
  }
}
await writeFile("dist/THIRD_PARTY_LICENSES.txt", [...notices.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text).join("\n\n"));
await writeFile("dist/LICENSE", await readFile("../../LICENSE", "utf8"));
await chmod("dist/synch.js", 0o755);
