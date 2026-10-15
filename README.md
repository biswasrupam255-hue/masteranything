# masteranything — CI/CD, practically

A tiny Express + TypeScript API that exists only so we can build a real pipeline around it.
You learn by pushing commits and watching them pass or fail — not by reading theory.

## The app

| Thing | Where |
| --- | --- |
| Business logic | `src/greeting.ts` |
| HTTP routes | `src/app.ts` (`GET /health`, `GET /api/greet?name=`) |
| Entry point | `src/server.ts` |
| Tests | `tests/` (vitest + supertest) |

```bash
npm run dev        # run it locally on :3000
npm test           # 6 tests
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run build      # -> dist/
```

Those five commands are the whole point. **CI is just a server running the commands you
already run locally, on every push, in a clean machine you cannot cheat on.** Everything
else in this course is detail on top of that one idea.

## Lessons

Work through them in order. Each one ends with you pushing a commit and watching GitHub.

- [ ] **01 — [Your first pipeline](lessons/01-first-pipeline.md)** — workflow anatomy, `on`/`jobs`/`steps`, `npm ci`, seeing red and going green
- [ ] **02 — Fast and honest** — caching, parallel jobs, a matrix across Node versions, cancelling stale runs
- [ ] **03 — Gates** — PR-triggered runs, required status checks, branch protection: making CI *mean* something
- [ ] **04 — Artifacts and reports** — uploading build output and coverage, job summaries
- [ ] **05 — Secrets and environments** — repo secrets, `permissions:`, environments with manual approval
- [ ] **06 — Containers** — multi-stage `Dockerfile`, build and push to GHCR, tagging by git SHA
- [ ] **07 — Continuous delivery** — a deploy job, staging vs production, promotion, rollback
- [ ] **08 — Team guardrails** — Dependabot, CODEOWNERS, pre-commit hooks, reusable workflows

## Vocabulary, once

- **CI (continuous integration)** — every push gets automatically built and tested.
- **CD (continuous delivery/deployment)** — every green commit is automatically shippable, and (deployment) actually shipped.
- **Workflow** — one YAML file in `.github/workflows/`. Triggered by events.
- **Job** — a set of steps on one fresh virtual machine. Jobs run in parallel by default.
- **Step** — one command (`run:`) or one reusable action (`uses:`).
- **Runner** — the machine executing a job. `ubuntu-latest` is GitHub's, and is what ~everyone uses.
