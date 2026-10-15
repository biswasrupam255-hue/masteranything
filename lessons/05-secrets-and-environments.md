# Lesson 05 — Secrets and environments

Your pipeline is about to need credentials. This lesson is about not leaking them, and about
making production something a human has to agree to.

---

## 1. Secrets vs variables

```bash
gh secret   set DEPLOY_TOKEN --env staging --body "..."           # write-only, masked
gh variable set TARGET_URL   --env staging --body "https://..."   # plain text, readable
```

Listing them shows the difference better than any explanation:

```
$ gh secret list
DEMO_API_KEY    2026-10-15T17:52:45Z              <- name and date. No value. Ever.

$ gh variable list --env production
TARGET_URL      https://masteranything.invalid    <- value, right there
```

**Secrets are write-only.** Not even you can read one back - not in the UI, not via the API.
You replace it or you delete it. That is the correct design: "what is the value of
PROD_TOKEN?" becomes a question nobody can answer, including an attacker who gets read
access to your repo settings.

Config goes in variables. Credentials go in secrets. A URL is not a credential.

## 2. Three scopes

| Scope | Set with | Visible to |
| --- | --- | --- |
| Organization | `gh secret set --org` | repos you select - one rotation for many repos |
| Repository | `gh secret set` | **every** workflow in the repo |
| Environment | `gh secret set --env production` | only jobs that name that environment |

Environment scope is the under-used one. Our `staging` and `production` environments both
define `DEPLOY_TOKEN` with *different values*. A job declaring `environment: staging` reads
the staging value and **cannot** read production's. A job naming no environment reads neither.

That is how you stop a test job touching production credentials - structurally, not by
remembering.

## 3. The `environment:` key does three things

```yaml
deploy-production:
  environment:
    name: production
    url: ${{ vars.TARGET_URL }}
```

1. **Unlocks** that environment's secrets and variables for the job.
2. **Records a deployment** - the Environments page shows what is live where.
3. **Enforces that environment's protection rules** - where the gate comes from.

We configured `production` with required reviewers and a branch policy:

- **required reviewers** - the job *pauses* until a human clicks Approve. The run waits,
  burning no minutes, until someone decides.
- **protected_branches** - production can only be deployed from a protected branch. Nobody
  ships `wip-hack-3` to prod, however they contrive the workflow file.

## 4. Masking is not security

`deploy-staging` prints the same (fake) secret three ways on purpose:

```bash
echo "1. printed straight : $DEPLOY_TOKEN"
echo "2. base64 encoded   : $(printf %s "$DEPLOY_TOKEN" | base64)"
echo "3. reversed         : $(printf %s "$DEPLOY_TOKEN" | rev)"
```

The actual output from our run, which is **not** what this lesson first claimed:

```
1. printed straight : ***
2. base64 encoded   : ***                              <- also masked
3. reversed         : a3f9-nekot-yolped-gnigats-EKAF   <- LEAKED
```

GitHub does better than a naive literal match: when you register a secret it also masks
common encodings of it, base64 among them. So #2 is covered.

#3 is not, and that is the point. Masking is **pattern matching over log text**, with a
fixed set of known transforms. Anything outside that set - reverse, rot13, split in half,
gzip, hex, or just posting it to an attacker's server instead of printing it - passes
straight through. Any dependency in `node_modules` can read `process.env` and exfiltrate it
without writing a single line to the log, where no mask could ever apply.

So: masking is a safety net for *accidents*, not a control against *malice*. The controls
that matter are scope (environment secrets), short-lived credentials (OIDC), and not running
untrusted code with secrets in scope (forks, next).

> **The habit this is really teaching:** this lesson originally asserted that base64 defeats
> masking. Running it proved otherwise. Pipelines are full of confident folklore - check it
> against a real run before you believe it, exactly as we did with job timings in lesson 02.

## 5. Forks: the part that bites people

**A `pull_request` run from a fork gets no secrets and a read-only `GITHUB_TOKEN`.** This is
deliberate: anyone can open a PR, and a PR is code you have not read yet. If forks got
secrets, every public repo would be a credential vending machine.

Consequences you will meet:

- Deploy jobs must be guarded, as ours are, with a check on `github.event_name` and `github.ref`.
- A fork PR failing because a secret is empty is *working as intended*.

**The trap:** `pull_request_target` runs in the context of the *base* repo, **with** secrets,
while the PR branch supplies the code. Check out the PR head in that job and you have handed
any stranger your secrets. It is the most exploited misconfiguration in GitHub Actions. If you
must use it, never check out untrusted code in the same job.

## 6. `GITHUB_TOKEN` and least privilege

Every run gets an auto-generated, auto-expiring `GITHUB_TOKEN`. We set `permissions: contents: read`
at the top of the workflow. Widen it per job, never globally, and only to what that job needs
(lesson 06 adds `packages: write` to exactly one job). A compromised dependency inherits
whatever the job it runs in was given.

## 7. The modern answer: OIDC

Long-lived cloud keys in secrets are the old way. Current practice is **OIDC**:

```yaml
permissions:
  id-token: write
```

GitHub mints a short-lived signed token describing *this* run - repo, branch, environment -
and AWS/GCP/Azure trade it for temporary credentials. Nothing long-lived is stored, so there
is nothing to leak and nothing to rotate. Use it wherever your target supports it.

## 8. Exercises

1. **Approve a production deploy.** After this merges, `main` runs and `deploy-production`
   waits for you. Approve it on the run page and watch the job start. Then open the
   repository's Environments page.
2. **Prove environment scoping.** Add a step to `quality` (which names no environment) that
   echoes the length of `DEPLOY_TOKEN`. It prints `0`. Remove it again.
3. **Prove the fork guard.** Open any PR and confirm both deploy jobs are skipped.
4. **Rotate one.** `gh secret set DEPLOY_TOKEN --env staging --body "new-value"`. Notice
   there is no "view current" step, because there cannot be.

## 9. What you can now answer

- Why can you not read a secret back?
- What does naming an `environment:` do - all three things?
- What does masking protect against, and what does it not?
- Why do fork PRs get no secrets, and why is `pull_request_target` dangerous?
- What problem does OIDC solve that a stored key cannot?

**Next:** Lesson 06 — Containers. A real image, pushed to GHCR, tagged so you can tell what is
running in production.
