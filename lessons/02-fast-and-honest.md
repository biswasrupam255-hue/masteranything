# Lesson 02 — Fast and honest

Lesson 01's pipeline worked, but it was lying to you in two ways and wasting money in a third:

- It only ever proved the code works on **one Node version** — yours.
- A failing lint meant you never found out whether the tests pass. One red X, one piece of information.
- Push three times in a minute and GitHub happily ran three full pipelines, two of them already pointless.

Same checks, better shape.

---

## 1. Jobs are parallel, steps are serial

This is the single most important structural fact about Actions:

```
jobs:                      <- these run AT THE SAME TIME, on separate VMs
  quality: steps: [...]    <- these run ONE AFTER ANOTHER, same VM
  test:    steps: [...]
  build:   steps: [...]
```

So the rule is: **put things in the same job when they share state or must be ordered.
Put them in different jobs when they're independent and you want them to race.**

Our new shape:

```
   quality ──┐
             ├──> build
   test(22) ─┤
   test(24) ─┘
```

`quality` and both `test` cells start simultaneously. `build` waits, because of:

```yaml
build:
  needs: [quality, test]
```

`needs` is the only thing creating order between jobs. No `needs` = starts immediately.

> **The honest trade-off:** each job is a fresh VM, so each one re-runs `npm ci` (~5s with a
> warm cache). We pay ~15s of duplicated install to save ~25s of waiting, and we get
> independent red/green signals. For a repo this small it's close to a wash — on a real
> codebase with a 4-minute test suite it's transformative. Don't split jobs reflexively;
> split them when a step is slow, independent, or you want its result reported separately.

## 2. The matrix

```yaml
strategy:
  fail-fast: false
  matrix:
    node: ["22", "24"]
```

One VM per value, in parallel. `${{ matrix.node }}` is substituted per cell. Add
`os: [ubuntu-latest, windows-latest]` and you'd get 4 cells — matrices multiply.

**`fail-fast: false` matters.** The default (`true`) cancels every sibling the moment one
cell fails, so you learn "it broke on *something*". With it off you learn "it breaks on 22
and passes on 24" — which is the sentence that actually tells you what to fix.

## 3. `concurrency` — the free money

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

`github.ref` is the branch/PR. Push a fixup 20 seconds after the last push and the earlier
run is killed mid-flight. On a busy repo this is the single biggest saver of CI minutes, and
it costs one stanza. Teams forget it constantly.

## 4. `permissions` — least privilege

```yaml
permissions:
  contents: read
```

Every job gets an auto-generated `GITHUB_TOKEN`. Without this block it inherits the repo
default, which may include **write**. A compromised dependency running in your CI with a
write token can push commits. Declare the minimum; widen per-job only where needed (we will,
in lesson 06, to push a container image).

## 5. `timeout-minutes` and `paths-ignore`

- `timeout-minutes: 10` — a hung test holds a runner for **6 hours** by default. Always set it.
- `paths-ignore: ["**.md", "lessons/**"]` — a README typo shouldn't trigger a build.
  (Careful: this applies to `push` only here, so PR runs still cover everything.)

## 5b. What it actually measured (your repo, real numbers)

We ran both shapes on the same code:

| Pipeline | Wall clock |
| --- | --- |
| Lesson 01, one job | **23s** |
| Lesson 02, parallel + matrix | **37s** |

The "optimised" one is *slower*. The per-job numbers say why:

```
quality         17:28:10 -> 17:28:26   [16s]  test (node 22)  17:28:10 -> 17:28:22   [12s]   > genuinely parallel, free
test (node 24)  17:28:10 -> 17:28:22   [12s]  /
build           17:28:29 -> 17:28:43   [14s]  <- waited on needs:, then a 4th VM boot
```

Every job pays ~12s of fixed cost: allocate VM, checkout, setup Node, `npm ci`. Our `build`
job spent 14s to run a 2s `tsc`.

**So the real rule is: parallelism is free, but jobs are not.** Split when a job is slow and
independent. Here, `build` should either be merged back into `quality`, or - better, lesson
04 - build once and hand the output onward as an artifact instead of rebuilding.

Keep the matrix anyway. It didn't make anything faster; it made it *truer*. You now have
evidence the code runs on Node 22 and 24, which no amount of single-job speed would give you.

> The habit worth stealing from this lesson: **measure your pipeline before you believe it.**
> `gh run view <id> --json jobs` gives you exactly the table above.

## 6. Exercises

1. **Make the matrix earn its keep.** Add `"20"` to the `node:` list and push. It goes red —
   `vitest@5` declares `engines: ^22.12.0 || ^24.0.0 || >=26.0.0`. That red cell *is the
   feature*: you just learned your test runner won't work for anyone still on Node 20,
   without installing Node 20. Remove it again afterwards.
2. **Watch `concurrency` fire.** Push two commits back to back, quickly. The first run shows
   up as **cancelled** in `gh run list`. That's the stanza paying for itself.
3. **Prove `needs` works.** Break the lint rule (add an unused variable), push, and watch
   `build` get **skipped** while `test` still runs and reports honestly.
4. **Reverse the trade-off.** Ask yourself: if `npm ci` took 90 seconds instead of 5, would
   three jobs still be the right call? (Answer in lesson 04 — you'd build once and pass the
   output along as an artifact.)

## 7. What you can now answer

- When do two things belong in one job vs two jobs?
- What does `fail-fast: false` buy you, and what does it cost?
- Why is `permissions: contents: read` not paranoia?
- What makes `build` wait, and what would happen if you deleted that line?

**Next:** Lesson 03 — Gates. All of this still only *reports*. We make it *block*.
