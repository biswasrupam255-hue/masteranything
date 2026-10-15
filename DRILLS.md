# Drills — break it, then find it

Reading about a failure teaches you nothing. Diagnosing one teaches you everything.

Each drill plants a **realistic** failure: the kind that actually reaches a real PR, not a
typo. Work them in any order. For each one, answer the same four questions **before** you
look at the answer:

1. Which job failed, and which jobs passed?
2. What is the exact error line?
3. Why did the jobs that passed, pass?
4. What is the minimal fix?

Question 3 is the one that builds the skill. "It broke" is not a diagnosis; "it broke here
and not there, because X" is.

Useful commands throughout:

```bash
gh run list --limit 5
gh run view <run-id>
gh run view <run-id> --log-failed
gh pr checks <pr-number>
gh pr view <pr-number> --json mergeable,mergeStateStatus
```

---

## Drill 01 — The missing dependency *(planted, PR #6)*

**Symptom:** `quality`, `test (22)`, `test (24)` and `build` all green. `smoke` red.

**Hint:** read the `npm ci` line in the failing job's log, and compare it with the same line
in `build`.

<details><summary>Answer</summary>

`express` was moved from `dependencies` to `devDependencies`. Tests pass because dev
dependencies are installed for them; `smoke` runs `npm ci --omit=dev`, so `express` is
absent and the compiled server cannot import it. Fix: move it back to `dependencies`.

The real-world version of this is someone running `npm install --save-dev` by habit, or a
"tidy up the dependency groups" commit. It reaches production as a container that will not
boot.
</details>

---

## Drill 02 — The lockfile that disagrees

**Plant it:** edit a version in `package.json` by hand (say `"express": "^5.4.0"`) and commit
**without** running `npm install`.

**Symptom:** every job fails at the install step, early and loudly.

<details><summary>Answer</summary>

`npm ci` installs strictly from `package-lock.json` and refuses to run when the two files
disagree: `npm ci can only install packages when your package.json and package-lock.json are
in sync`. The fix is `npm install` (which updates the lockfile), then commit **both** files.

This is `npm ci` doing its job. `npm install` in CI would have silently resolved a different
tree than any developer has locally — which is the bug class `npm ci` exists to prevent.
</details>

---

## Drill 03 — Works on Windows, fails on Linux

**Plant it:** in `src/app.ts`, change the import to `./Greeting.js` (capital G) and rename
nothing.

**Symptom:** passes locally on Windows. `quality`, `test` and `build` all fail in CI with a
module-not-found error.

<details><summary>Answer</summary>

Windows and macOS filesystems are case-insensitive by default; Linux is not. `./Greeting.js`
resolves locally and does not exist on `ubuntu-latest`. Fix: match the real filename exactly.

This is the single most common "but it works on my machine" in CI, and the reason running
your pipeline on Linux has value even when you develop on Windows.
</details>

---

## Drill 04 — Two artifacts, one name

**Plant it:** in the `test` job, delete `if: matrix.node == '24'` from the
**Upload the clickable HTML coverage report** step, so both matrix cells upload.

**Symptom:** one matrix cell goes green, the other fails in the upload step. Which one fails
varies between runs.

<details><summary>Answer</summary>

Artifact names must be unique within a run. Both cells race to create `coverage-html`; the
loser errors. The non-determinism (which cell wins) is the tell for a race.

Two valid fixes: name it per cell (`coverage-html-${{ matrix.node }}`), or upload from one
cell only. Choose by asking whether you actually want a report per version.
</details>

---

## Drill 05 — The secret that is empty

**Plant it:** add a step to the `quality` job:
`run: echo "token length: ${#DEPLOY_TOKEN}"` with
`env: { DEPLOY_TOKEN: "${{ secrets.DEPLOY_TOKEN }}" }`.

**Symptom:** no failure. It prints `token length: 0`. The same step in `deploy-staging`
prints `30`.

<details><summary>Answer</summary>

`DEPLOY_TOKEN` is an **environment** secret. Only a job that declares
`environment: { name: staging }` can read it; `quality` declares none, so the value is empty
string.

Note this failed *silently* — a missing secret is an empty variable, not an error. Which is
why `deploy-staging` has `test -n "$DEPLOY_TOKEN"`: a deploy that proceeds with an empty
credential is far worse than one that stops.
</details>

---

## Drill 06 — The PR that can never merge

**Plant it:** add `paths-ignore: ["**.md"]` under the `pull_request:` trigger in `ci.yml`,
then open a PR that changes only a markdown file.

**Symptom:** no checks run at all. The PR is not red — it is stuck, forever, reporting
"Expected — Waiting for status to be reported".

<details><summary>Answer</summary>

`ci-ok` is a **required** check. `paths-ignore` means no run starts, so `ci-ok` never
reports, so the requirement can never be satisfied. Not failed — never arrived.

This is why `paths-ignore` belongs on `push` (saving minutes on `main`) but is dangerous on
`pull_request` once checks are required. The standard fix if you really want to skip docs
PRs is a job that reports success for skipped paths, rather than no job at all.
</details>

---

## Drill 07 — The gate that lets failures through

**Plant it:** remove `if: always()` from the `ci-ok` job. Then break a test and open a PR.

**Symptom:** `test` is red, but `ci-ok` shows as *skipped*, and the PR reports a pending
required check rather than a clean failure.

<details><summary>Answer</summary>

Without `if: always()`, a job whose `needs:` failed is **skipped**, not run. A skipped
required check never reports a conclusion, so the PR hangs instead of failing.

`if: always()` makes `ci-ok` run regardless, inspect `needs.*.result` itself, and fail
loudly. One line, and it is the difference between a gate and a trap.
</details>

---

## Drill 08 — The cache that never hits

**Plant it:** in the `Dockerfile`, move `COPY src ./src` to *above* `RUN npm ci`.

**Symptom:** nothing fails. The `image` job just gets slower, and its log shows npm
reinstalling everything on every single run.

<details><summary>Answer</summary>

Docker invalidates every layer after the first change. With `src/` copied before `npm ci`,
any source edit busts the dependency layer, so a full reinstall happens on every commit.

The fix is the ordering the Dockerfile ships with: manifests, install, then source. Measure
it — compare `image` job durations before and after. A drill with no red X is good practice
at reading CI for *cost*, not just correctness.
</details>

---

## Drill 09 — The deploy that ships the wrong thing

**Plant it:** in `deploy-staging`, remove `image` from `needs:` (leave the `echo` that uses
`needs.image.outputs.digest`).

**Symptom:** the job succeeds. The log prints
`image: ghcr.io/owner/repo@` — with nothing after the `@`.

<details><summary>Answer</summary>

Referencing the output of a job that is not in `needs:` yields an empty string, silently.
GitHub does not error on an unknown context — it interpolates nothing.

A real deploy step would then pull `repo@`, or worse, fall back to `latest` and ship
something nobody tested. This is why `container-smoke` asserts the running version equals
`github.sha`: an empty or stale reference must fail loudly, not deploy quietly.
</details>

---

## Drill 10 — The matrix that tells you nothing

**Plant it:** set `fail-fast: true` in the `test` job, then break something that only fails
on Node 22.

**Symptom:** `test (node 22)` fails and `test (node 24)` shows as **cancelled** rather than
passing.

<details><summary>Answer</summary>

`fail-fast: true` cancels every sibling cell the moment one fails. You learn "it broke", not
"it broke on 22 and is fine on 24" — and the second sentence is the one that tells you
whether you have a version-compatibility problem or a plain bug.

The cost of `fail-fast: false` is a few runner-minutes. The benefit is a complete answer on
the first run instead of the third.
</details>

---

## Scoring yourself

You are getting good at this when, for a red pipeline, you can say **before opening the
log**: which job should have caught it, and which jobs you expect to be green. That is the
whole skill. The log just confirms it.
