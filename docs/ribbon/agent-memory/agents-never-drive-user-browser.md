---
name: agents-never-drive-user-browser
description: "Subagents must not control or resize the user's own browser (Comet); use headless or the built-in pane"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 428f1961-b6ad-4758-ba30-ff5eb1800006
  modified: 2026-10-05T13:44:26.241Z
---

Subagents doing screenshot QA drove the user's real Comet browser (the "Claude started debugging this browser" banner) and resized its window to test sizes like 2000×1250 and 2560×1080. That left the window larger than the MacBook screen and confused the user.

**Why:** It changes the user's own environment without asking, and makes the site look broken to them.

**How to apply:** In every Sonnet brief that involves screenshots, require a headless browser (Playwright/Puppeteer) or the built-in browser pane. Never use claude-in-chrome or the user's browser, and never resize their windows. Related: [[delegate-implementation-to-sonnet]].
