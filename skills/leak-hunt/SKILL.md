---
name: leak-hunt
description: Find and fix what keeps filling a disk or a host. Use when disk, Docker images, build caches, temp or runner directories, logs, VM or sparse disk images, or processes keep growing, or before cleaning a machine that refills. Traces each pile to the code or config that generates it, fixes the generator, proves it stopped, then cleans the backlog.
---

# Leak Hunt

Deleting a pile treats the symptom; the disk fills again on the next build. A leak hunt finds the
generator behind each pile, fixes it, proves it stopped growing, and only then removes the backlog.

## Order of work

1. **Measure.** List what is large and what grows, with bytes actually used (not configured
   maximums: a sparse bundle or VM disk reports a cap it may not occupy). Useful reads:
   `df -h`, `du -sh` on candidate roots, `docker system df -v`, `docker image ls --digests`,
   `docker buildx du`, runner work and temp directories, log directories, package-manager caches,
   and VM or disk images. Record a baseline with timestamps; a pile that is not growing is not a leak.
2. **Trace each growing pile to its generator.** Name the exact code or config and why it leaks.
   Common generators:
   - a Dockerfile that copies the source before installing dependencies, so every commit rebuilds
     the dependency layer, and a deploy that keeps every image (successful or failed) without pruning;
   - a CI runner or test harness that creates a temp directory, database, emulator, or container per
     run and never removes it, or a runner stuck in a restart loop writing logs;
   - logs without rotation, build caches without a size limit or retention;
   - a VM or sparse disk image that only grows because nothing compacts or recreates it;
   - background processes or dev servers started and never stopped.
   If a pile has no generator you can name, say so; do not guess one.
3. **Fix the generator.** Give what it creates a lifetime: reuse (layer order, cache mounts, a
   shared dependency layer), retention (keep the last N images or builds, prune on deploy), removal
   (temp and workspace directories deleted after each run, in a `finally` or teardown that also runs
   on failure), rotation (log size and count), and a bound (compact or recreate disk images on a
   schedule, cap cache size). Change the code or config that owns the behavior, through the normal
   builder route and repository conventions.
4. **Prove it stopped.** Run the generator at least twice (two builds, two test runs, two deploys,
   or the scheduled job twice), including one failing run when failures were part of the leak, and
   show the pile stays flat or returns to the baseline. A fix without this measurement is not done.
5. **Clean the backlog last.** Remove what the generator already accumulated only after step 4.
   Delete what is provably regenerable and unused (dangling images, build cache, temp directories of
   finished runs). Anything that may hold data (volumes, databases, VM disks, user directories)
   keeps the destructive-action gate in SYSTEM.md: identify it, show what it holds, and get the
   user's go-ahead for that exact item before removing it.

## Delegation

Measuring several roots or hosts and reading several generators are independent: give each to a
scout or general-purpose agent and keep the synthesis. Fixes that touch different repositories go to
separate builders. Host and SSH operations stay with the orchestrator.

## Report

For each pile: size and growth before, generator and why it leaked, the fix (commit or PR), the
measurement that proves it stopped, and the space recovered. List what you did not remove and why.
