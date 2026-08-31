# Passbook

**It found the money you already lost, and wrote the letter to get it back.**

An agent reads your real bank statement, finds charges you paid twice, and drafts the dispute
letters with you. You edit, accept, reject. Passbook exports a dispute pack you can send to your
bank: a document neither you nor the agent produces alone.

Built for [The WebMCP Challenge](https://webmcp.devpost.com/). MIT licensed.

> **Try it:** open Passbook in ChatGPT's in-app browser, or Chrome 149+ with
> `chrome://flags/#enable-webmcp-testing` enabled, and say:
> *"Go through my statement and tell me where I am losing money."*
>
> A demo statement loads automatically, so nothing needs uploading to see it work.

## Why WebMCP

Remove `document.modelContext` and this is a spreadsheet you read by yourself. With WebMCP, your
own agent queries the ledger and writes drafts back into a document you commit.

```
Without WebMCP   read 1,630 rows by eye, spot the double charge, write the letter yourself
Passbook         get_duplicate_candidates -> draft_dispute_case -> (you accept) -> export pack
```

The agent never receives a credential. It cannot commit anything: every draft lands in the pack
as a proposal, and only a human action moves it into the exported document. The draft the agent
wrote is kept next to the version you accepted, so the difference stays visible.

## What makes the findings trustworthy

Duplicate detection is the whole product, so it is built to be defensible rather than noisy.

- **Keyed on the bank reference column**, not on date plus amount plus merchant. Two charges
  sharing a reference are one posting seen twice. Two with different references are two charges.
- **Reversal pairs are excluded.** A debit followed by a matching credit was refunded, and
  reporting it under "money you lost" would be wrong.
- **Recurring arrangements are excluded.** A merchant that bills the same amount repeatedly is a
  standing arrangement, not an error. Without this rule, matching the real statement produced 367
  candidates, of which 222 were one investment platform and 110 another. Requiring the amount to
  be unusual *for that counterparty* is what separates the accident from the habit.
- **Cash withdrawals are excluded.** Repeated round amounts from the same ATM card are routine.
- **Every finding carries its evidence**: both rows, both references, and the reasoning that
  ruled out a reversal. Confidence is stated as high or medium and the heuristic behind it is
  spelled out rather than hidden.

## Statement parsing

`pdf.js` runs entirely in the browser. Password protected statements are supported through the
`onPassword` callback, decrypted in the worker; the password is never stored, logged, or uploaded.

Columns are positional, not delimited, and the two alignments behave differently: amounts are
right aligned while narration is left aligned and wraps. Bands are therefore derived from each
header label's **right** edge and runs are matched on their **left** edge, which is the single
rule that files every column correctly.

Every parse is checked against the statement's own running balance
(`balance[n] === balance[n-1] + amount[n]`). That gives a per row checksum, so a parsing failure
is localised to one row instead of leaving a wrong number somewhere across 154 pages.

Verified against a real 154 page HDFC statement: **1,630 rows detected, 1,630 parsed, 0 failures,
balance chain intact end to end.**

Coverage metadata travels with every tool result, so the agent can never report a total without
knowing how much of the statement it is based on.

## The tools

| Tool | Kind | Purpose |
|---|---|---|
| `list_accounts` | read | Accounts, period, closing balance |
| `get_duplicate_candidates` | read | Findings with evidence and reasoning |
| `get_transactions` | read | Filter by date or description |
| `get_spending_summary` | read | Totals in and out |
| `draft_dispute_case` | draft | Write a case into the pack as a proposal |
| `dismiss_candidate` | draft | Record why something is not worth disputing |
| `get_pack_status` | read | What is in the pack |

Read tools carry `readOnlyHint`. Anything returning statement narration carries
`untrustedContentHint`, because narration is written by whoever sent the money and is not
Passbook's text.

## Honest limits

Stated here because they are the questions worth asking.

- Passbook does not move money. It produces a document you send to your bank.
- The page is not a security boundary against its own user. Enforcement here is about what the
  *model* can do, not about defeating DevTools.
- Chrome's own guidance says it is *"impossible to guarantee safety inside of a large language
  model"*. Passbook makes no claim to have solved prompt injection.
- Tool results reach the model, so this is data minimisation rather than "your data never leaves
  the browser". The agent gets the fields a tool returns, never a credential, never a bulk export.
- The activity log records what the page emitted. It cannot record what the agent retained,
  because observations bypass `execute` entirely.
- Duplicate detection is a heuristic with stated confidence. It surfaces candidates for a human to
  judge; it does not decide.

## Running locally

```bash
npm install
npm run dev        # serves with Origin-Agent-Cluster: ?1
npm test           # unit tests plus the real statement parser check
npm run build
```

The parser test runs against a statement in `~/Downloads` when present and skips otherwise, so a
clean checkout is never blocked. Real statements are never committed: `.gitignore` excludes
`*.pdf` and `fixtures/statements/`.

## Notes on the API

Two things verified on Chrome 151 while building this, in case they save someone else the time:

- `executeTool` takes its arguments as a **JSON string**. Passing an object rejects with
  `UnknownError: Failed to parse input arguments`.
- The tool passed to `executeTool` must be the object returned by `getTools()`. It carries a
  required `origin` member, and a hand built literal throws a `TypeError` before execution.
