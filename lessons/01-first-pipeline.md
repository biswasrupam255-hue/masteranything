# Lesson 01 — Your first pipeline

**Goal:** a robot runs your tests on every push, and you can read its output.

---

## 1. The mental model

You already know this flow:

```
edit code  ->  npm test  ->  commit  ->  push
```

The problem is the `npm test` step is *optional* and *on your machine*. People skip it when
they're in a hurry, and "works on my machine" hides missing dependencies.

CI removes both problems:

```
push  ->  GitHub starts a fresh Linux VM  ->  clones your repo
      ->  installs deps from the lockfile  ->  runs your commands
      ->  marks the commit green or red
```

That's it. A workflow file is a list of shell commands plus the question *when should these run*.

## 2. Read the file

Open [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It's commented. Four things
to actually notice:

**`on:`** — the trigger. `push` to `main` and *any* `pull_request`. Nothing else makes it run.

> Trivia you will hit eventually: in YAML 1.1, the bare word `on` is a *boolean*, so some
> tools parse this key as `True`. GitHub reads it correctly, but that's why you'll see
> `"on":` quoted in some repos and linters.

**`runs-on: ubuntu-latest`** — a brand-new machine, every time. It has git, Node, Docker and
common tooling preinstalled, and *nothing* of your project. That's why step one is checkout.

**`uses:` vs `run:`** — `run:` is a shell command. `uses:` pulls in someone else's packaged
step (an *action*) at a pinned version. `actions/checkout@v7` means repo `actions/checkout`,
tag `v7`. Pin the major version; never leave it off.

**`npm ci` not `npm install`** — `ci` deletes `node_modules`, installs *exactly* what
`package-lock.json` says, and errors if the lockfile is out of sync. Reproducible builds
depend on this. If you remember one line from this lesson, it's this one.

> Order matters for feedback speed: lint (2s) before test (10s) before build (15s). The
> cheapest check that can fail should fail first.

## 3. Push it and watch

```bash
git add -A && git commit -m "ci: add verify workflow" && git push
```

Then watch the run from your terminal:

```bash
gh run watch
```

You should see each step tick green. `gh run view --log` prints the full log; the same thing
lives under the **Actions** tab on github.com.

## 4. Now break it on purpose

This is the important half of the lesson. CI you've never seen fail is CI you don't trust.

In `src/greeting.ts`, change the greeting:

```ts
return `Hi, ${trimmed}!`;   // was: `Hello, ${trimmed}!`
```

Commit and push. The run goes **red**, and the summary names the failing step and assertion:

```
AssertionError: expected 'Hi, Rupam!' to be 'Hello, Rupam!'
```

Two things to internalise while looking at that red X:

1. The failure is attached to **the commit**, forever. Anyone can see which commit broke what.
2. Nothing stopped the push. CI *reported*; it did not *block*. Blocking is lesson 03.

Now revert it (`git revert HEAD` or edit it back), push, and watch it go green again.

## 5. Exercises

1. **Break the lockfile instead.** Hand-edit a version in `package.json` without running
   `npm install`, then push. Read the `npm ci` error. This is the failure `npm install`
   would have silently hidden.
2. **Make the trigger stricter.** Add `paths-ignore: ['**.md', 'lessons/**']` under `push:`
   so editing documentation doesn't burn CI minutes. Push a README-only change and confirm
   no run starts.
3. **Read someone else's.** `curl -s https://raw.githubusercontent.com/expressjs/express/master/.github/workflows/ci.yml`
   — you'll recognise most of it, and the parts you don't are lesson 02.

## 6. What you can now answer

- Why `npm ci` and not `npm install`?
- What does `runs-on` get you, and what does it *not* have?
- What's the difference between `uses:` and `run:`?
- Does CI prevent a broken commit from landing on `main`? (No — not yet.)

**Next:** [Lesson 02 — Fast and honest](02-fast-and-honest.md) — this pipeline is wastefully
serial and only tests one Node version. We fix both.
