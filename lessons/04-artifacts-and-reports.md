# Lesson 04 — Artifacts and reports

Until now, every job destroyed its own work. `build` compiled TypeScript into `dist/`, the
VM was deleted, and `dist/` went with it. You were verifying *source code* and shipping
something **no job had ever executed**.

This lesson keeps the output, runs it, and makes CI tell you things instead of just passing.

---

## 1. Artifacts: files that outlive the VM

```yaml
- name: Upload dist/
  uses: actions/upload-artifact@v7
  with:
    name: dist
    path: dist/
    retention-days: 7
    if-no-files-found: error
```

```yaml
- name: Download dist/ from the build job
  uses: actions/download-artifact@v8
  with:
    name: dist
    path: dist
```

- **`name`** must be **unique within a run**. The classic failure is a matrix where every
  cell uploads `coverage` - the second one errors. Use `coverage-node-${{ matrix.node }}`,
  or upload from exactly one cell (what we do).
- **`retention-days`** - artifacts cost storage. 90 days by default; 7 is plenty for CI
  debris. Set it and forget about the bill.
- **`if-no-files-found: error`** - the default is `warn`, which means a broken build can
  upload *nothing* and still go green. Almost always wrong.

> Note the version skew: `upload-artifact@v7` but `download-artifact@v8`. They are separate
> actions with separate release cycles. Never assume matching majors - check.

## 2. The smoke job: test what you ship

```yaml
smoke:
  needs: [build]
  steps:
    - run: npm ci --omit=dev          # production dependencies ONLY
    - uses: actions/download-artifact@v8
      with: { name: dist, path: dist }
    - run: |
        node dist/server.js &
        SERVER_PID=$!
        for i in $(seq 1 20); do
          if curl -fsS http://localhost:3000/health -o health.json; then break; fi
          sleep 0.5
        done
        test "$(jq -r .status < health.json)" = "ok"
        kill "$SERVER_PID"
```

Three deliberate details:

**`--omit=dev` is the whole point.** It installs production dependencies only. If something
you `import` at runtime accidentally sits in `devDependencies`, every test still passes (dev
deps are installed for tests) and production dies on boot. This job catches that class of bug
*before* deploy, and it is one of the highest-value jobs in any pipeline.

**The retry loop, not `sleep 5`.** A fixed sleep is either too short (flaky CI) or too long
(wasted minutes, every run, forever). Poll until ready, with a bounded number of attempts.

**It runs `dist/server.js`,** not `src/`. The first job in this pipeline that exercises the
artifact you would actually deploy.

## 3. Job summaries: CI that reports, not just passes

Anything you append to `$GITHUB_STEP_SUMMARY` renders as Markdown on the run page:

```yaml
- run: node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
```

Nobody reads a 400-line log. A table at the top of the run gets read every time. Good things
to put there: coverage, bundle size deltas, migration lists, deployed URLs, failing test names.

**Keep the logic in a file, not in YAML.** [`scripts/coverage-summary.mjs`](../scripts/coverage-summary.mjs)
runs locally:

```bash
npm run test:coverage && node scripts/coverage-summary.mjs
```

Logic buried in a `run: |` block can only be tested by pushing a commit. That is a miserable
way to debug, and it is how CI files rot.

## 4. Coverage as a floor

[`vitest.config.ts`](../vitest.config.ts) sets thresholds:

```ts
thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
```

Below these, the test command exits non-zero and CI fails. Two warnings worth internalising:

- Coverage is a **floor, not a target**. 100% coverage of code that asserts nothing proves
  nothing. It tells you what was *executed*, never what was *verified*.
- We exclude `src/server.ts` - a process entry point with nothing meaningfully testable.
  Excluding genuinely untestable files is honest; excluding files because they drag the
  number down is lying to yourself.

## 5. The aggregator paid for itself

We added a whole new `smoke` job this lesson. Branch protection needed **zero changes**,
because the required check is still `ci-ok`, and `ci-ok` just grew one more entry in `needs`.
Had we required job names directly, every lesson would mean editing protection settings.

## 6. The honest cost

Upload + download of `dist/` costs a few seconds and some storage. Our build takes ~2s, so
for *this* repo it is not a speed win - it is a **correctness** win, because `smoke` can now
run the real artifact. On a project with a 3-minute build consumed by four jobs, building
once and passing it along is also a large time win.

As in lesson 02: know which of the two you are buying.

## 7. Exercises

1. **Catch a dependency leak for real.** Move `express` from `dependencies` to
   `devDependencies` in `package.json`, push. `quality`, `test` and `build` all stay green -
   and `smoke` dies with `Cannot find module 'express'`. That is the bug this job exists for.
   Put it back.
2. **Click the report.** Open the run page, download the `coverage-html` artifact, open
   `index.html`. Line-by-line coverage of your own code.
3. **Collide two artifact names.** Remove the `if: matrix.node == '24'` from the upload step
   so both cells upload `coverage-html`. Read the error.
4. **Break the floor.** Delete the `shouts when asked` test and drop `src/greeting.ts`
   coverage below 80%. CI fails on the threshold, not on a failing test.

## 8. What you can now answer

- Why must artifact names be unique, and what breaks if they aren't?
- What does `npm ci --omit=dev` catch that your tests structurally cannot?
- Why a retry loop instead of `sleep`?
- Why is `if-no-files-found: error` the right default?
- What does coverage actually measure - and what does it not?

**Next:** Lesson 05 — Secrets and environments. The pipeline is about to need credentials,
and `echo $SECRET` is how people leak them.
