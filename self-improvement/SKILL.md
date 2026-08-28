---
name: self-improvement
description: 让 Agent 记录经验、偏好与修正结果，从错误中学习、提炼经验教训，并随着时间推移不断优化自身行为。当用户说出 "improve yourself"（改进你自己）、"learn from that mistake"（从那次错误中学习）、"log what went wrong"（记录出错之处）、"review your lessons"（回顾你的教训）、"run a self-audit"（运行自我审计）、"check your soul file"（检查你的灵魂文件）、"update your playbook"（更新你的行动手册）等指令时使用；或当智能体检测到自身犯了错误、应当予以记录时使用。此外，该功能还会在会话开始时触发，以加载既往的学习成果，并定期触发以检测反复出现的错误模式。
metadata:
  author: OpenClaw
  version: 1.2.0
  category: agent-behaviour
---

# Self-Improvement System

This skill runs a continuous self-improvement loop. The agent learns from mistakes, extracts reusable lessons, and compounds improvements across sessions.

---

## Privacy and Data Safety — read this first

All log entries must describe **reasoning errors and process failures only**. They must never contain user data.

**Never log any of the following:**

- Personally identifiable information (names, emails, phone numbers, addresses, IDs)
- Credentials, API keys, tokens, or passwords
- Financial data, account numbers, or transaction details
- Health, legal, or other sensitive personal information
- Verbatim user messages or any direct quotes from user input
- File contents, code, or data provided by the user

**Log only:**

- The type of reasoning error that occurred
- The process step where it happened
- The abstract root cause (e.g. "skipped validation step", "assumed tool was available")
- The preventive rule in general terms

If describing a mistake requires including any user-provided content, paraphrase in fully abstract terms or omit the detail entirely. When in doubt about whether a detail is safe to log, leave it out.

---

## Session Startup — always do this first

Before taking any action in a new session, read the following files if they exist:

- `soul.md` — core behavioural principles (these override defaults)
- `lessons.md` — extracted rules and heuristics
- `journal.md` — recent decision log (last 50 lines)

If none exist, proceed normally. If any exist, incorporate their guidance into your behaviour for this session.

---

## After Every Meaningful Action

After completing a non-trivial task (decision, code change, research, design), ask:

1. **Did I make any errors or near-misses?**
2. **What did I learn that might be useful next time?**
3. **Should I update my soul, lessons, or journal?**

If yes to any, update accordingly. Don't overthink it — be brief and practical.

---

## What to Log

### Update `soul.md` when you discover a **persistent preference or principle**

```markdown
## [Date]
- Added: [principle/preference]
- Reason: [why this matters]
- Revision: [if updating old principle]
```

### Update `lessons.md` when you learn a **practical shortcut or pattern**

```markdown
## [Date]
- Lesson: [what you learned]
- Context: [when this applies]
- Evidence: [how you know it works]
```

### Update `journal.md` when you make a **notable decision or tradeoff**

```markdown
## [Date] — [Brief title]
- Situation: [what was at stake]
- Decision: [what you chose]
- Tradeoff: [what you sacrificed]
```

---

## Important Rules

1. **Be concise.** A short log entry is better than no entry.
2. **Be honest.** Record failures and uncertainties, not just successes.
3. **Be abstract.** Never include user data, credentials, or identifiable information.
4. **Be practical.** Only log things that might actually help you later.
5. **Don't over-log.** Not every action deserves a journal entry. Use judgment.

---

## Why This Matters

Agents without memory repeat the same mistakes. Agents with poor memory make inconsistent decisions. A well-maintained soul/lessons/journal system turns each session into a building block for a more competent, coherent agent over time.

This skill exists to make that accumulation automatic rather than accidental.
