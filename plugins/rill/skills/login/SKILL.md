---
name: login
description: Sign in to Rill from Claude Code (device flow — a link and a code, wallet login in the browser). Run /rill:login before using /rill:trade.
disable-model-invocation: true
allowed-tools: Bash(node *scripts/rill.mjs*)
---

# /rill:login

Connect this Claude Code to the user's Rill account. Two script calls, both via Bash with the exact commands below (no `cd`, no env prefix).

## Step 1 — get the link and code

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/rill.mjs" login --start
```

Relay its output **verbatim** to the user right away (the link, the code, and whether the browser was opened). The last line tells you the exact `--wait` command for step 2; copy it, do not retype the device code.

## Step 2 — wait for approval

Run the `--wait` command from step 1 with a **10-minute Bash timeout** (`timeout: 600000`):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/rill.mjs" login --wait --device-code <from step 1> --interval <from step 1> --expires-in <from step 1>
```

It polls until the user approves in the browser, then saves the token to `~/.rill/credentials.json` (mode 0600) and prints the Rill ID, wallet, today's Daily catch and the privacy notice. Relay that output **verbatim** — the privacy notice must reach the user unchanged, in both languages as printed.

## Then

- Approved → tell the user they can now run `/rill:trade BTC` (or just ask about a Hyperliquid market), and that each completed analysis counts toward the Daily catch shown on their dashboard.
- Denied / expired / timed out → relay the line the script printed and offer to run `/rill:login` again.
- The script failed to start (network, `rill: …` on stderr) → relay it; suggest checking the connection or `RILL_API_BASE` if they run a dev backend.

Never ask for, display, or store a wallet key or seed phrase — the wallet signs in the browser only.
