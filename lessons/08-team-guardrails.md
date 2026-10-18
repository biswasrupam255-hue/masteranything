# Lesson 08 — Team guardrails

Everything so far protects `main` from *your mistakes*. This lesson is about the failures
that arrive on their own: dependencies rotting, an action you trusted getting repointed, and
the second person joining the repo.

---

## 1. Pin actions by SHA, not by tag

In [`.github/actions/node-setup/action.yml`](../.github/actions/node-setup/action.yml):

```yaml
uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
```

**A tag is a mutable pointer.** Whoever controls `actions/setup-node` can repoint `v7` at new
code tomorrow, and that code executes inside your CI, with your `GITHUB_TOKEN`, with access
to whatever secrets that job can see. This is not hypothetical — it is the standard
supply-chain attack on CI, and `tj-actions/changed-files` was compromised exactly this way in
2025, affecting tens of thousands of repositories.

A commit SHA cannot be repointed. The trailing `# v7.1.0` comment is how you stay sane, and
it is what Dependabot reads when it updates the pin.

> **The counter-argument, honestly:** pinned SHAs go stale, security fixes included. Pinning
> is only correct *with* Dependabot keeping the pins moving. Pinning and then ignoring it for
> two years is worse than tracking the tag.

## 2. Composite actions: one place to change

That `setup-node` + `npm ci` pair appeared in five jobs. Now:

```yaml
- uses: actions/checkout@v7
- uses: ./.github/actions/node-setup        # quality, build, release
- uses: ./.github/actions/node-setup        # test matrix
  with:
    node-version: ${{ matrix.node }}
- uses: ./.github/actions/node-setup        # smoke
  with:
    install-flags: "--omit=dev"
```

One pinned version, one cache policy, five call sites. The refactor pays for itself on the
pinning alone: five SHAs to bump is five chances to miss one.

**Composite action vs reusable workflow** — the distinction people get wrong:

| | Composite action | Reusable workflow |
| --- | --- | --- |
| Unit | a group of **steps** | a group of **jobs** |
| Called with | `uses: ./path` inside a job | `uses: owner/repo/.github/workflows/x.yml@v1` at job level |
| Runs on | the caller's runner | its own runners |
| Can define a matrix | no, it lives inside one | yes, whole job graphs |
| Needs checkout first | yes, when local | no |
| Secrets | whatever the caller's job has | explicit `secrets: inherit` or named |

Rule of thumb: repeated **steps** become a composite action. A whole pipeline repeated across
**repos** becomes a reusable workflow.

## 3. Dependabot

[`.github/dependabot.yml`](../.github/dependabot.yml) watches three ecosystems:

- **npm** — your dependencies
- **github-actions** — your workflow pins, including the composite action's own directory,
  which `/` does *not* discover; it needs its own entry
- **docker** — the `FROM node:24-alpine` line, where most of your actual CVE exposure lives

The setting that decides whether this helps or becomes noise is **grouping**:

```yaml
groups:
  dev-dependencies:
    dependency-type: development
    update-types: [minor, patch]
```

One PR for all dev-dependency bumps, vetted by CI as a unit. Without grouping you get
fourteen PRs a week, you start rubber-stamping them, and that is worse than not running
Dependabot at all. Production majors and minors deliberately stay ungrouped — those deserve
to be read.

**Dependabot is only safe because of lessons 01–03.** A bot opening PRs into a repo without
required checks is a liability. Into this repo, every bump must pass `ci-ok` before it can
land.

### What actually happened here: green and still wrong

Dependabot's first PR on this repo bumped the Dockerfile from `node:24-alpine` to
`node:25-alpine`. Every check passed, so it was merged. Then:

| | Node version |
| --- | --- |
| `.nvmrc` (quality, build, smoke) | 24 |
| test matrix | 22, 24 |
| `Dockerfile` - what actually ships | **25** |
| `vitest` supported engines | `^22.12 || ^24 || >=26` - 25 **excluded** |

CI was green because every job tested 22 and 24. The container we would deploy ran 25, which
nothing tested and the test runner does not support. `container-smoke` passed because it
only probes `/health`.

**CI only checks what you tell it to check.** No job asserted that the Dockerfile and
`.nvmrc` agree, so nothing noticed. Two fixes, both needed:

1. `ignore` Node majors in `dependabot.yml` - the base image major follows `.nvmrc`, which is
   a human decision, not a bot one. Patches and minors still come through, and that is where
   CVE fixes live.
2. [`scripts/check-node-version.mjs`](../scripts/check-node-version.mjs) in the `quality`
   job, failing the build when `.nvmrc`, the Dockerfile and the matrix disagree.

The generalisable lesson: **every time two files have to agree, write the check that asserts
it.** Version drift between config files is invisible to tests by construction - the tests
only ever run one of the two.

## 4. CODEOWNERS

[`.github/CODEOWNERS`](../.github/CODEOWNERS) auto-requests reviewers per path. **Last
matching pattern wins**, so specific rules go at the bottom — the opposite of your
`.gitignore` instincts.

On its own it is a suggestion. Combined with branch protection's
`require_code_owner_reviews: true` it becomes a rule: nobody edits `/.github/` without the
owner of CI seeing it. That is the control that stops someone quietly weakening the pipeline
inside a 40-file PR.

## 5. Pre-commit hooks are a convenience, not a control

[`.githooks/pre-commit`](../.githooks/pre-commit) runs lint and typecheck before a commit:

```bash
git config core.hooksPath .githooks
```

Two facts define what hooks are *for*:

- `git commit --no-verify` skips them entirely.
- A fresh clone has them **disabled** until someone runs that config command.

So a hook can never be a guarantee — it is a fast local echo of what CI will say, saving you
a 90-second round trip. Enforcement lives on the server, where it cannot be skipped. Teams
that confuse the two end up with a `main` branch protected by etiquette.

## 6. What this course deliberately did not add

Being straight with you about the gaps:

- **SAST / CodeQL** — `github/codeql-action` scans for vulnerability patterns. One job, well
  worth adding on a real project.
- **Dependency review** — `actions/dependency-review-action` blocks PRs that introduce
  known-vulnerable packages.
- **Merge queue** — the real answer to `strict: true` thrash past a handful of PRs a day: it
  tests each PR against the post-merge state, serially, without blocking authors.
- **Signed commits** (`required_signatures`) — proves who wrote a commit, not just who pushed.
- **Progressive delivery** — canaries, feature flags, per-region environments.
- **Monitoring and alerting** — CI tells you the build is fine. It cannot tell you production
  is fine. That is a different discipline, and the honest limit of everything in this course.

## 7. Exercises

1. **Experience the hook, then defeat it.** `git config core.hooksPath .githooks`, introduce
   an unused variable, and try to commit — the hook blocks you. Now `git commit --no-verify`,
   push, and watch CI catch it anyway. That contrast *is* the lesson.
2. **Make CODEOWNERS binding.** Add `"require_code_owner_reviews": true` to the branch
   protection payload from lesson 03, then open a PR touching `/.github/`.
3. **Read a real Dependabot PR.** They land Mondays. Check it passed `ci-ok` before you even
   look at the diff.
4. **Convert a job into a reusable workflow.** Move `quality` into
   `.github/workflows/reusable-quality.yml` with `on: workflow_call`, then call it from
   `ci.yml`. Notice what changes about `needs:` and about secrets.

## 8. What you can now answer

- Why is `@v7` riskier than a SHA, and why is pinning wrong without Dependabot?
- Composite action or reusable workflow — which, and why?
- Why does dependency grouping matter more than the update schedule?
- Why can a pre-commit hook never be the enforcement mechanism?
- What can CI *not* tell you about your production system?

---

That is the course. From an empty folder you now have a tested pipeline, a protected branch,
an immutable artifact, gated environments, promotion with rollback, and the guardrails to
keep it honest.

The remaining skill is judgement — knowing which of these a given project actually needs —
and that only comes from running them.
