// Catches the failure mode that shipped a broken release.yml: a line at
// column 0 inside a `run: |` block ends the YAML block scalar and becomes a
// stray top-level key. The file still parses as YAML, so a YAML check passes
// and GitHub rejects the workflow with a 0-second "startup failure".
//
// No YAML parser needed: the rule is simply that nothing may start at column
// 0 except a known top-level key, a comment, or a document marker.
//
// Run locally: node scripts/check-workflows.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_KEYS = new Set([
  "name",
  "on",
  "run-name",
  "permissions",
  "concurrency",
  "env",
  "defaults",
  "jobs",
]);

const ACTION_KEYS = new Set([
  "name",
  "description",
  "author",
  "inputs",
  "outputs",
  "runs",
  "branding",
]);

function filesToCheck() {
  const out = [];
  const wfDir = ".github/workflows";
  if (existsSync(wfDir)) {
    for (const f of readdirSync(wfDir)) {
      if (f.endsWith(".yml") || f.endsWith(".yaml")) {
        out.push({ path: join(wfDir, f), allowed: WORKFLOW_KEYS });
      }
    }
  }
  const actionsDir = ".github/actions";
  if (existsSync(actionsDir)) {
    for (const d of readdirSync(actionsDir)) {
      const p = join(actionsDir, d, "action.yml");
      if (existsSync(p)) out.push({ path: p, allowed: ACTION_KEYS });
    }
  }
  return out;
}

let problems = 0;

for (const { path, allowed } of filesToCheck()) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  lines.forEach((line, i) => {
    if (line === "" || /^[\s#]/.test(line) || line.startsWith("---")) return;

    const match = /^([A-Za-z0-9_"'-]+)\s*:/.exec(line);
    if (!match) {
      console.error(`${path}:${i + 1}  unexpected content at column 0: ${line.slice(0, 60)}`);
      problems += 1;
      return;
    }

    const key = match[1].replace(/['"]/g, "");
    if (!allowed.has(key)) {
      console.error(
        `${path}:${i + 1}  stray top-level key "${key}" ` +
          `(a run: block almost certainly lost its indentation above this line)`,
      );
      problems += 1;
    }
  });
}

if (problems > 0) {
  console.error(`\n${problems} problem(s) found in workflow files.`);
  process.exit(1);
}

console.log(`workflow files look structurally sane (${filesToCheck().length} checked)`);
