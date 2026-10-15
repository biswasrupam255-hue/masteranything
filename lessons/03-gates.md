# Lesson 03 — Gates

Lessons 01 and 02 built a pipeline that *reports*. You proved yourself it doesn't *prevent*:
commit `8bbe68c` went red and sat on `main` until you reverted it. Red CI that nobody is
forced to obey is decoration.

This lesson makes `main` physically unable to accept bad code.

---

## 1. The PR flow (the thing CI is actually for)

```
git checkout -b feat/thing     ->  work  ->  push branch  ->  open PR
                                                  |
                                          CI runs on the PR
                                                  |
                                     green?  ->  merge  ->  main
                                     red?    ->  merge button disabled
```

`main` stops being somewhere you push. It becomes somewhere things *arrive*, having passed.

### One trigger, one run

Our workflow says:

```yaml
on:
  push:
    branches: [main]      # <- note the restriction
  pull_request:
```

When we pushed `feat/shout-greeting` and opened PR #1, exactly **one** run happened, on the
`pull_request` event. Delete `branches: [main]` and every PR commit runs the whole pipeline
*twice* - once for the branch push, once for the PR - forever, at double the minutes. It is
the most common waste in real repositories. Check the `event` column in `gh run list`.

## 2. Required checks are matched by NAME - so require a name that never changes

The naive setup is to require `quality`, `test (node 22)`, `test (node 24)`, `build`. Then
someone bumps the matrix to `["24", "26"]`, and protection sits there waiting forever for a
check called `test (node 22)` that will never report again. The PR hangs. Nobody knows why.

The industry-standard fix is one aggregator job, and it is the only check we require:

```yaml
  ci-ok:
    if: always()
    needs: [quality, test, build]
    runs-on: ubuntu-latest
    steps:
      - if: contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')
        run: exit 1
      - run: echo "all required jobs passed"
```

Two load-bearing details:

- **`needs: [...]`** makes it wait for everything, and `needs.*.result` lets it inspect them.
- **`if: always()`** is not optional. Without it, a failed upstream job makes `ci-ok`
  *skipped* - and a skipped required check **never reports**, so your PR hangs on a pending
  gate instead of showing a clean red X. This bites people constantly.

Now you can change the matrix freely. The gate's name never moves.

## 3. Turning the gate on

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {"strict": false, "contexts": ["ci-ok"]},
  "enforce_admins": true,
  "required_pull_request_reviews": {"required_approving_review_count": 0, "dismiss_stale_reviews": true},
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Field by field, with the trade-off that matters:

| Field | What it does | The trade-off |
| --- | --- | --- |
| `contexts: ["ci-ok"]` | the check that must be green | require the aggregator, never matrix cells |
| `strict: false` | don't force branches to be up to date with `main` first | `true` is safer (catches semantic conflicts) but every merge forces every other PR to update - painful past ~5 PRs/day. `true` + merge queue is the big-team answer |
| `enforce_admins: true` | **you** are not exempt | honest, and stops "I'll just push this one hotfix". The cost: emergency fixes also need a PR |
| `required_approving_review_count: 0` | a PR is required, approvals are not | correct for solo work. Set to 1 the moment a second person exists |
| `dismiss_stale_reviews: true` | new commits void old approvals | always want this; otherwise approval of v1 ships v7 |
| `required_linear_history: true` | no merge commits | pairs with squash merge: one commit per PR on `main`, trivially revertable |
| `allow_force_pushes: false` | nobody rewrites `main` | always |

> **Free-plan trap:** branch protection and rulesets are paid-only on **private** repos.
> `403 Upgrade to GitHub Pro or make this repository public`. Public repos get it free.

## 4. Proof it works

With protection on, pushing straight to `main`:

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "ci-ok" is expected.
! [remote rejected] main -> main (protected branch hook declined)
```

That's the whole lesson in five lines. The rule is enforced by the **server**, not by
discipline, not by a hook you can skip with `--no-verify`, and not by remembering.

## 5. Reading merge state

`gh pr view 1 --json mergeable,mergeStateStatus` gave us, while a run was still in flight:

```
mergeable: MERGEABLE   mergeStateStatus: BLOCKED
```

Those two are different questions, and conflating them wastes afternoons:

- **`mergeable`** = *does it conflict with `main`?* (a git question)
- **`mergeStateStatus`** = *will protection let you?* (a policy question)

`BLOCKED` with everything green usually means a required check hasn't reported **yet**. We
found `"build: null"` among the check runs - a second run had started on the same SHA after
a force-push. Once it finished: `CLEAN`.

`UNSTABLE` is the one worth knowing too: a non-required check is failing. It *will* let you
merge. If that surprises you, the check should have been required.

## 6. Exercises

1. **Watch the gate stop you.** Branch, break a test deliberately, push, open a PR. The merge
   button is disabled and `gh pr view --json mergeStateStatus` says `BLOCKED`. Fix the test,
   push again, watch it flip to `CLEAN`.
2. **Hang your own PR.** Add `paths-ignore: ["**.md"]` under `pull_request:` too, then open a
   docs-only PR. No run starts, so `ci-ok` never reports, so the required check is never
   satisfied - the PR is stuck forever. This is why `paths-ignore` belongs on `push` but is
   dangerous on `pull_request` once checks are required. Undo it.
3. **Try to cheat.** `git push --force main`. Read the rejection.
4. **Feel the `strict: true` cost.** Flip it on, open two PRs, merge one. Watch the other
   demand an update before it can merge.

## 7. What you can now answer

- Why require an aggregator job instead of the real jobs?
- What does `if: always()` prevent, concretely?
- Difference between `mergeable` and `mergeStateStatus`?
- When is `strict: true` right, and what does it cost?
- Why is `paths-ignore` on `pull_request` dangerous once checks are required?

**Next:** Lesson 04 — Artifacts and reports. `build` currently compiles and throws the result
away. We keep it, pass it between jobs, and publish test coverage.
