// Prints a Markdown table from vitest's coverage-summary.json.
// Kept as a file, not inline YAML, so you can run it locally:
//   npm run test:coverage && node scripts/coverage-summary.mjs
import { readFileSync } from "node:fs";

const path = "coverage/coverage-summary.json";

let summary;
try {
  summary = JSON.parse(readFileSync(path, "utf8")).total;
} catch {
  console.log(`> No coverage summary found at \`${path}\`.`);
  process.exit(0);
}

const rows = ["lines", "statements", "functions", "branches"].map((key) => {
  const { pct, covered, total } = summary[key];
  const mark = pct >= 90 ? "🟢" : pct >= 80 ? "🟡" : "🔴";
  return `| ${key} | ${mark} ${pct}% | ${covered}/${total} |`;
});

console.log("### Coverage\n");
console.log("| Metric | Percent | Covered |");
console.log("| --- | --- | --- |");
console.log(rows.join("\n"));
