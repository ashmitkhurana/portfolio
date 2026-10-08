---
name: usage-run-until-exhausted
description: Owner's usage rule: work until plan usage runs out, then resume when it resets. There is NO 80% stop line.
metadata:
  type: feedback
---

On 2026-10-08 the owner said: "work until usage is gone and then resume working when session usage resets". They never set an 80% weekly stop rule. An old STATUS.md note claimed one; it was false and has been removed.

**Why:** an agent stopped at 74% weekly, citing that phantom rule, and the owner was annoyed.

**How to apply:**
- Don't stop work for usage levels.
- Keep working efficiently (see [[delegate-implementation-to-sonnet]]) until limits block you.
- Before the 5-hour window runs out, schedule a resume check-in for just after the reset time, using mcp__ccd_session_mgmt__get_usage for resetsAt.
- Never invent or carry forward usage "guards" from old notes without the owner confirming them.
- Related: [[work-autonomously-to-delivery]].
