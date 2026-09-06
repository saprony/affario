import { execFileSync, spawnSync } from "node:child_process";

const MINIMUM_NODE_VERSION = [22, 18, 0];
const [nodeMajor, nodeMinor, nodePatch] = process.versions.node
  .split(".")
  .slice(0, 3)
  .map((part) => Number.parseInt(part, 10));
const nodeVersionIsSupported =
  [nodeMajor, nodeMinor, nodePatch].every(Number.isSafeInteger) &&
  (nodeMajor > MINIMUM_NODE_VERSION[0] ||
    (nodeMajor === MINIMUM_NODE_VERSION[0] &&
      (nodeMinor > MINIMUM_NODE_VERSION[1] ||
        (nodeMinor === MINIMUM_NODE_VERSION[1] &&
          nodePatch >= MINIMUM_NODE_VERSION[2]))));

if (!nodeVersionIsSupported) {
  throw new Error("npm test richiede Node.js 22.18.0 o successivo.");
}

const trackedTests = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--",
    "*.test.ts",
  ],
  { encoding: "utf8" }
)
  .split(/\r?\n/u)
  .map((path) => path.trim())
  .filter(Boolean)
  .map((path) => path.replaceAll("\\", "/"))
  .filter((path) => !path.split("/").includes("node_modules"))
  .map((path) => `./${path}`);

if (trackedTests.length === 0) {
  throw new Error("Nessun test AFFARIO tracciato trovato.");
}

const testHooksUrl = new URL(
  "./register-typescript-test-hooks.mjs",
  import.meta.url
).href;
const result = spawnSync(
  process.execPath,
  [
    "--experimental-transform-types",
    "--import",
    testHooksUrl,
    "--test",
    ...trackedTests,
  ],
  { stdio: "inherit" }
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
