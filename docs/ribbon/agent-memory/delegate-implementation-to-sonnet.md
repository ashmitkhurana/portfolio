---
name: delegate-implementation-to-sonnet
description: Opus only plans/specs/reviews; ALL execution goes to Sonnet/Haiku subagents with exact instructions; max 3 parallel
metadata:
  node_type: memory
  type: feedback
  originSessionId: 428f1961-b6ad-4758-ba30-ff5eb1800006
  modified: 2026-10-07T14:48:21.180Z
---

The main session is always Opus 5.5 and the user always talks to it. Opus's job: understand the request and design the EXACT solution (files, changes, acceptance checks). Execution is never done by Opus — it is delegated to subagents via the Agent tool with `model: "sonnet"` or `model: "haiku"`.

Subagents are pure execution mediums: they must not assume, design, or decide anything. Every brief is fully explicit — exact file paths, exact changes (code/values where possible), scope and what not to touch, acceptance criteria, and "if anything is ambiguous, stop and report back instead of guessing". Opus reviews their results and relays outcomes.

Parallelism: independent, non-overlapping tasks may run as parallel subagents, but **at most 3 concurrently** (user confirmed 2026-10-07).

Every brief must forbid unbounded wait loops, with a reason: on 2026-10-07 an agent left 7 `until grep …; do sleep; done` loops polling a log that never completed, and they ran for about 8 hours. Waits must use a hard timeout (e.g. `timeout 1800`). Agents must stop servers only by port (`kill $(lsof -ti tcp:PORT -sTCP:LISTEN)`), never with pkill/killall patterns. On 2026-10-07 that took down the owner's live dev server on :3100. After agents finish, check that no stray shells are left (`pgrep -fl snapshot-zsh`).

**Why:** User wants to stretch their usage as far as possible; Opus is expensive, Sonnet/Haiku are cheap executors.

**How to apply:** Plan in the main thread with light, targeted reads only; push heavy work (big searches, long builds, large edits) to agents. Haiku for mechanical work (spec'd edits, renames, builds, scripts, screenshots, simple checks); Sonnet for execution that still needs skill (complex code, guided debugging, multi-file changes). Never Opus for execution. This standing instruction counts as the user's explicit request to spawn subagents.
