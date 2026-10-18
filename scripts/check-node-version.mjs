// Asserts that every place declaring a Node version agrees.
//
// Motivated by a real incident in this repo: a green Dependabot PR bumped the
// Dockerfile to node:25-alpine. CI stayed on 22 and 24 (.nvmrc + the matrix),
// so every test passed while the shipped container ran a major nothing tested
// and that vitest does not support. Green, merged, and wrong.
//
// Run locally: node scripts/check-node-version.mjs
import { readFileSync } from "node:fs";

const nvmrc = readFileSync(".nvmrc", "utf8").trim();
const expected = nvmrc.split(".")[0];

const problems = [];

// --- Dockerfile ------------------------------------------------------------
const dockerfile = readFileSync("Dockerfile", "utf8");
const fromLines = [...dockerfile.matchAll(/^FROM\s+node:(\d+)[^\s]*/gm)];

if (fromLines.length === 0) {
  problems.push("Dockerfile: no `FROM node:<version>` lines found");
}

for (const [line, major] of fromLines.map((m) => [m[0], m[1]])) {
  if (major !== expected) {
    problems.push(
      `Dockerfile: "${line}" uses Node ${major}, but .nvmrc says ${expected}. ` +
        `You would ship a runtime nothing tests.`,
    );
  }
}

// --- test matrix -----------------------------------------------------------
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const matrixLine = /^\s*node:\s*\[(.+)\]\s*$/m.exec(ci);

if (!matrixLine) {
  problems.push(".github/workflows/ci.yml: could not find the test matrix `node:` list");
} else {
  const versions = matrixLine[1]
    .split(",")
    .map((v) => v.trim().replace(/["']/g, "").split(".")[0]);

  if (!versions.includes(expected)) {
    problems.push(
      `ci.yml: the test matrix is [${versions.join(", ")}] but .nvmrc says ${expected}. ` +
        `The version you build and ship with is never tested.`,
    );
  }
}

// --- report ----------------------------------------------------------------
if (problems.length > 0) {
  console.error("Node version mismatch:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nPick one version, change .nvmrc first, then follow it everywhere.");
  process.exit(1);
}

console.log(
  `Node ${expected} is consistent across .nvmrc, Dockerfile (${fromLines.length} stages) and the test matrix`,
);
