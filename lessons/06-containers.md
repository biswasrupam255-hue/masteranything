# Lesson 06 — Containers

Lesson 04's `smoke` job ran your compiled `dist/` on a GitHub runner that already had the
right Node, the right libc and the right everything. Production is not that machine.

A container image is the answer: you stop shipping code and start shipping **the machine**.

---

## 1. Multi-stage builds

Read [`Dockerfile`](../Dockerfile). Three stages, and only the third one ships:

```
build    node + typescript + ALL dev dependencies  ->  produces dist/
deps     node + production dependencies only       ->  produces node_modules/
runtime  node + deps/node_modules + build/dist     ->  THIS is the image
```

The first two stages are scaffolding. The TypeScript compiler, vitest, eslint and their ~165
transitive packages are used and then **left behind** - they never exist in the published
image. That is smaller downloads, faster cold starts, and a much smaller attack surface:
a vulnerability in a dev dependency cannot be exploited in a container that doesn't contain it.

## 2. Layer order is a performance decision

```dockerfile
COPY package.json package-lock.json ./   # <- changes rarely
RUN npm ci                               # <- expensive, cached while the above is unchanged
COPY src ./src                           # <- changes every commit
RUN npm run build                        # <- cheap
```

Docker caches each layer and invalidates everything after the first change. Copy `src/`
*before* `npm ci` and every single commit reinstalls every dependency. Same commands, same
result, ten times slower - purely because of the order.

The rule: **least-frequently-changed things first.**

## 3. The details that separate a toy image from a real one

**`.dockerignore`.** Everything not listed gets uploaded to the builder as "build context".
Without it you ship `.git`, `node_modules`, and any `.env` you forgot about - into a layer
that anyone who pulls the image can read.

**`USER node`.** Containers run as **root** by default. The official node images ship a
non-root `node` user; one line uses it. Now a process escape starts unprivileged.

**`CMD ["node", "dist/server.js"]` - exec form, not `CMD node dist/server.js`.** Shell form
wraps your process in `/bin/sh`, which does not forward `SIGTERM`. Your container then
ignores the stop signal, gets `SIGKILL`ed ten seconds later, and drops every in-flight
request on every deploy. A JSON array makes your process PID 1 and lets it shut down cleanly.

**`HEALTHCHECK`.** Lets the orchestrator (Kubernetes, ECS, Compose) know the difference
between "the process is running" and "the app actually works". A process can be alive and
useless.

**`ARG APP_VERSION` / `ENV APP_VERSION`.** We stamp the git SHA in at build time, and
`GET /health` reports it. Now "what is actually running in production?" is a question with an
answer, which during an incident is worth more than almost anything else in this file.

## 4. Publishing to GHCR

```yaml
permissions:
  contents: read
  packages: write      # on THIS job only
```

The `image` job widens permissions; nothing else in the workflow can publish. Login needs no
PAT at all:

```yaml
- uses: docker/login-action@v4
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

That token is minted for this run and expires with it. Compare that with storing a registry
password as a secret forever.

### Tags come from `metadata-action`, not from shell

```yaml
tags: |
  type=sha,format=long
  type=ref,event=branch
  type=raw,value=latest,enable={{is_default_branch}}
```

One image, several tags: the immutable SHA tag, a branch tag, and `latest` only on the
default branch.

### Build on every run, push only from main

```yaml
push: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
```

A PR must never publish an image - but it *must* prove the Dockerfile still builds, which is
why the build itself is unconditional.

### Cache

```yaml
cache-from: type=gha
cache-to: type=gha,mode=max
```

Layer cache in the Actions cache. `mode=max` caches intermediate stages too, which is what
makes multi-stage builds fast on the second run.

## 5. Digests, not tags

`container-smoke` runs the image like this:

```bash
IMAGE="ghcr.io/OWNER/REPO@${{ needs.image.outputs.digest }}"
```

**A tag is a pointer; a digest is the content.** `latest` means "whatever someone pushed
most recently", and `v1.2.3` can be force-pushed to point somewhere else entirely. A digest
(`sha256:...`) is the image. Deploy digests. Use tags for humans.

Then it asserts the image really is this commit:

```bash
test "$(jq -r .version < health.json)" = "${{ github.sha }}"
```

Without that line, a cache bug or a mis-tagged push could silently smoke-test *yesterday's*
image and report success.

## 6. Exercises

1. **Build it locally.** Start Docker Desktop, then:
   ```bash
   docker build --build-arg APP_VERSION=local -t masteranything:local .
   docker run --rm -p 3000:3000 masteranything:local
   curl localhost:3000/health
   ```
2. **Measure what multi-stage saved.** `docker images masteranything:local`. Then build a
   single-stage version (one `FROM`, `npm ci` with dev deps, no `--omit=dev`) and compare.
3. **Feel the shell-form bug.** Change `CMD` to shell form, rebuild, `docker run` it, then
   `docker stop` it and time how long it takes. Ten seconds versus instant.
4. **Prove non-root.** `docker run --rm masteranything:local whoami` -> `node`. Delete the
   `USER node` line, rebuild, run it again -> `root`.
5. **Break the layer cache on purpose.** Move `COPY src ./src` above `RUN npm ci`, rebuild
   twice, and watch `npm ci` run every time.

## 7. What you can now answer

- What does a multi-stage build actually leave behind, and why does that matter twice?
- Why does `COPY` order change build time so much?
- What breaks if `CMD` is in shell form?
- Why is `packages: write` on one job instead of at the top of the file?
- Why deploy a digest instead of `latest`?

**Next:** Lesson 07 — Continuous delivery. We have a tested, tagged, immutable image. Now we
promote it: staging, then production, with rollback.
