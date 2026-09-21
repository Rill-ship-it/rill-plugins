---
name: profile
description: Your Rill account from Claude Code — status (Rill ID, wallet, today's Daily catch), logout, or open the dashboard. /rill:profile [status | logout | open].
allowed-tools: Bash(node *scripts/rill.mjs*)
argument-hint: "[status | logout | open]"
---

# /rill:profile $ARGUMENTS

Route on the first word of `$ARGUMENTS` and run exactly one of these (Bash, no `cd`, no env prefix):

| Argument | Command | Then |
|---|---|---|
| *(none)* or `status` | `node "${CLAUDE_SKILL_DIR}/../../scripts/rill.mjs" status` | Relay verbatim. If it says not signed in, point to `/rill:login`. |
| `logout` | `node "${CLAUDE_SKILL_DIR}/../../scripts/rill.mjs" logout` | Relay verbatim. Mention `/rill:login` to reconnect. |
| `open` | `node "${CLAUDE_SKILL_DIR}/../../scripts/rill.mjs" open` | Relay the URL it printed (the browser opens when it can). |

Anything else → show this table and ask which one.

Notes for the reply: "Rill ID" is the `u_…` id shown by `status`; the wallet is display-only. The share switch (`~/.rill/config.json`, `"share": "full" | "meta"`) is shown by `status` — explain it only if asked: `meta` sends symbols, command and the structured record but no question/answer text, and still counts toward the Daily catch.
