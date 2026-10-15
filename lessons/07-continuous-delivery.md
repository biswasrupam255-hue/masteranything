# Lesson 07 — Continuous delivery

Three words people use interchangeably and shouldn't:

- **Continuous integration** - every commit is built and tested. Lessons 01-04.
- **Continuous delivery** - every green commit is *provably deployable*, and shipping is a
  decision someone makes. Lessons 05-07.
- **Continuous deployment** - that decision is removed; green means it is already live.

You are at continuous delivery with a human gate on production, which is where the large
majority of real teams sit, and sensibly so.

> **Honesty about this lesson:** our deploy jobs print what they would do and verify the
> image boots. They do not update a real server, because this course does not have one.
> Everything around the deploy - promotion, gating, digests, rollback, audit - is exactly
> what you would run in production. Only the final "ship it" line would change.

---

## 1. Promote the artifact. Never rebuild it.

Before this lesson, `deploy-staging` and `deploy-production` ignored the container entirely.
Now both read the same output:

```yaml
needs: [ci-ok, image]
...
echo "image: ghcr.io/${{ github.repository }}@${{ needs.image.outputs.digest }}"
```

**Build once, deploy that exact thing everywhere.** If you rebuild per environment, staging
and production are *different artifacts* that merely came from the same source - different
base-image patch levels, different transitive dependency resolutions, different build-time
state. Then "it worked in staging" stops being evidence of anything.

This is why lesson 06 insisted on digests. A digest is the only identifier that cannot drift.

```
main → build image once → staging (automatic) → [human] → production (same digest)
```

## 2. Rollback is just a deploy of an older artifact

[`deploy.yml`](../.github/workflows/deploy.yml) takes two inputs: an environment, and an
image reference. That is the entire rollback mechanism.

```bash
gh workflow run deploy.yml -f environment=production -f image=sha256:<older-digest>
```

Two things make it trustworthy:

**It pulls before it deploys.** A typo in a digest fails at `docker pull`, not halfway
through replacing a running service.

**It verifies afterwards** - probes `/health` and reports the version the app itself claims.
A deploy that "succeeded" but is serving the old build is a bad outcome you want to catch
automatically.

And note what did *not* become an escape hatch:

```yaml
environment:
  name: ${{ inputs.environment }}
```

Dispatching manually to production **still** requires the approval click. The gate is on the
environment, not the workflow, so a second workflow cannot route around it.

### Rollback vs roll-forward

Rolling back is seconds and requires no thinking - it is the right move during an incident.
Rolling forward (fix, test, deploy) is slower but keeps history linear.

The honest caveat: **rollback only works if the old artifact still works.** A database
migration that dropped a column cannot be undone by redeploying the old image. That is why
real teams use expand/contract migrations - add the new column, deploy code that writes
both, migrate, only then remove the old one - so that every intermediate state is one your
previous release can still run against.

## 3. `concurrency` for deploys is the opposite of CI

```yaml
concurrency:
  group: deploy-${{ inputs.environment }}
  cancel-in-progress: false      # <- NOT like ci.yml
```

In CI, cancelling a superseded run saves money and loses nothing. In a deploy, killing a
half-finished rollout leaves the system in a state nobody designed. Queue; never cancel.

## 4. Releases: naming a version

[`release.yml`](../.github/workflows/release.yml) triggers on `v*.*.*` tags:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

It re-runs the tests (never publish a version you did not test, however green `main` looked),
builds the image, and tags it several ways at once:

```
type=semver,pattern={{version}}        -> 0.1.0
type=semver,pattern={{major}}.{{minor}} -> 0.1
type=semver,pattern={{major}}           -> 0
```

so consumers pin as tightly or as loosely as they like. Then `gh release create
--generate-notes` writes the changelog from merged PR titles - which is the real reason to
care about commit and PR hygiene.

Note `fetch-depth: 0` on the checkout: release notes need the whole history, and the default
clone has one commit.

## 5. What a real deploy step adds

Replace the `echo` with your platform's command, and the rest of this pipeline is unchanged:

| Platform | The line that changes |
| --- | --- |
| Kubernetes | `kubectl set image deploy/app app=$IMAGE` then `kubectl rollout status` |
| AWS ECS | update the task definition's image, then wait for the service to stabilise |
| Fly.io | `flyctl deploy --image $IMAGE` |
| Render / Railway | call the deploy hook with the image reference |

Real rollouts add: **readiness probes** (don't send traffic until it answers), **draining**
(let in-flight requests finish - this is what the exec-form `CMD` from lesson 06 enables),
and often **canary or blue/green** (a fraction of traffic first, automatic abort on error
rate). All of them assume the thing you are shipping is one immutable artifact, which is why
that came first.

## 6. Exercises

1. **Deploy manually.** `gh workflow run deploy.yml -f environment=staging` (blank image =
   `latest`). Read the summary: it reports the version the running container claimed.
2. **Roll back for real.** List the published versions:
   ```bash
   gh api user/packages/container/masteranything/versions --jq '.[] | "\(.name)  \(.created_at)"'
   ```
   Deploy an older digest to staging and watch `/health` report the *older* commit SHA. That
   is a rollback, start to finish, in one command.
3. **Prove the gate holds.** Dispatch the same workflow to `production`. It waits for
   approval, exactly like the automatic path.
4. **Cut a release.** `git tag v0.1.0 && git push origin v0.1.0`. Watch `release.yml` publish
   `0.1.0`, `0.1`, `0` and open a GitHub release with generated notes.

## 7. What you can now answer

- Why promote a digest instead of rebuilding per environment?
- Why is `cancel-in-progress: false` right for deploys and wrong for CI?
- Why does a manual deploy workflow not bypass the production gate?
- When does rollback *not* save you, and what practice fixes that?
- What exactly does `--generate-notes` build its changelog from?

**Next:** Lesson 08 — Team guardrails. Dependabot, CODEOWNERS, pinning actions by SHA,
pre-commit hooks, and reusable workflows.
