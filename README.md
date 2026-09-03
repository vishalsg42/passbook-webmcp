# Passbook

**It reads every row of your statement and finds the few worth a second look.**

An agent reads your real bank statement, finds charges you paid twice, and drafts the dispute
letters with you. You edit, accept, reject. Passbook exports a dispute pack you can send to your
bank: a document neither you nor the agent produces alone.

**Live: <https://passbook-webmcp.netlify.app>** · Built for
[The WebMCP Challenge](https://webmcp.devpost.com/) · MIT

> **Try it:** open Passbook in ChatGPT's in-app browser, or Chrome 149+ with
> `chrome://flags/#enable-webmcp-testing` enabled, and say:
> *"Which charges look like I was billed twice? Show me the evidence."*
>
> A demo statement loads automatically, so nothing needs uploading to see it work.
>
> **Want to check the parser rather than trust it?** Switch the header to *My statement* and press
> **Load a sample statement**. It is handed to the same function a dropped file goes through, not
> shortcutted into the store, so the column detection, the balance chain and the coverage numbers
> are all real &mdash; the activity log says *Imported*, not *Loaded the demo*. The file is
> generated from the rows the demo runs on, and a round-trip test asserts it re-imports to them
> transaction for transaction. Download it too if you want to read the input by eye.
>
> **No in-app browser? Use your own key.** The agent panel takes a Gemini or Anthropic key and
> drives the same tools through the same registry, so the tool surface still shrinks as you work
> and every call still lands in the activity log. The key is kept for that tab only and goes
> straight to the provider &mdash; Passbook has no server to send it to.
>
> **In any other browser it still works.** Passbook loads the WebMCP polyfill from
> [Chrome's own demo collection](https://github.com/GoogleChromeLabs/webmcp-tools), so the tools,
> the tool surface changing with state, and the activity log are all live and callable from the
> page. The polyfill cannot make tools discoverable to an agent *outside* the page, and the
> banner says so rather than implying browser support. Add `?nowebmcp` on a WebMCP-capable
> browser to force that path and see it.

---

## Measured on real bank statements, not fixtures

| | |
|---|---|
| Real statement, HDFC | **154 pages · 1,630 rows** |
| Rows parsed of rows detected | **1,630 / 1,630 — 0 failures** |
| Bank reference column coverage | **100%** |
| Running-balance chain | **intact end to end** |
| Second and third banks | Kotak Mahindra 107 rows · RBL 143 rows |
| Candidate pairs surfaced across the year | **9** out of 1,630 rows |
| Of those, confirmed bank errors | **0** — every one was an intentional payment |
| False positives suppressed by one rule | **367 candidate pairs** |

**That second-to-last row is the product, and the last row is why the copy says what it says.**
A naive `(date, amount, merchant)` match on this statement returns 367 pairs, of which **222 are a
single investment platform and 110 another** — instalment plans, not errors. Nine survive rules
that can each be read in the source. Getting from 367 to 9 is the work.

Then the nine were audited by the account holder, and **all nine were payments they meant to
make.** The balance chain reconciles across every pair, and four are adjacent rows where the
balance falls by that amount twice in succession — so the postings are real and the intent was
too. Passbook therefore does not claim to find duplicate charges. It claims to read 1,630 rows and
hand back the nine worth a second look, and to say plainly that only the account holder can settle
them. A tool that told you it had found money would have been wrong nine times out of nine here.

*(367 is measured holding out the recurring-arrangement rule while keeping the rail filter, the
date window and the reversal check. Quote the filters whenever you quote the number.)*

Real statements are never committed. `.gitignore` excludes `*.pdf` and `fixtures/statements/`;
the parser tests read from `~/Downloads` when present and skip otherwise.

---

## Why not just upload the PDF to ChatGPT

You can, and for a short statement it works fine. Passbook earns its place on three things, and
the advantage grows with the size of the statement and how much the answer matters.

**The numbers are computed, not read.** A model eyeballing 154 pages will miscount rows, misread
amounts, and quietly skip pages. Passbook parsed 1,630 of 1,630 with a balance-chain checksum
proving none were lost. Duplicate detection is code: reference-keyed, reversal-excluded,
recurring-arrangement excluded.

**The agent gets a field set, not your statement.** Uploading a PDF puts every transaction,
balance and counterparty in front of the model. Here the parsing happens in the tab and the agent
receives only what a tool chose to return. That is data minimisation, not secrecy: tool results
do reach the model, and the Activity panel lists the exact fields each call emitted so you can
check it rather than take our word for it.

**You get an artifact with state.** A chat message scrolls away. A dispute pack is edited case by
case, survives a reload, and exports as a letter you send to a bank.

The page does deterministic computation over its own data; the agent handles intent and prose.
Neither does the other's job.

---

## What makes the findings trustworthy

Duplicate detection is the whole product, so it is built to be defensible rather than noisy.

- **Keyed on the bank reference column**, not date plus amount plus merchant. Two charges sharing
  a reference are one posting seen twice. Two with different references are two charges.
- **Reversal pairs are excluded.** A debit followed by a matching credit was already refunded, and
  reporting it under "money you lost" is the worst available mistake.
- **Recurring arrangements are excluded.** A merchant billing the same amount repeatedly is a
  standing arrangement. Requiring the amount to be unusual *for that counterparty* is what
  separates the accident from the habit — and what removes 358 of those 367 pairs.
- **Cash withdrawals are excluded.** Repeated round amounts from the same ATM card are routine.
- **Every finding carries its evidence**: both rows, both references, and the reasoning that ruled
  out a reversal. Confidence is stated, and the heuristic behind it is spelled out rather than
  hidden.

Money is integer paise throughout. There is no float anywhere in the money path.

### Statement parsing

`pdf.js` runs entirely in the browser. Password-protected statements are supported through the
`onPassword` callback and decrypted in the worker; the password is never stored, logged, or
uploaded.

Columns are positional, not delimited, and the two alignments behave differently: amounts are
right-aligned while narration is left-aligned and wraps. Bands are therefore derived from each
header label's **right** edge and runs are matched on their **left** edge, which is the single
rule that files every column correctly.

Every parse is checked against the statement's own running balance
(`balance[n] === balance[n-1] + amount[n]`), giving a per-row checksum, so a parsing failure is
localised to one row instead of leaving a wrong number somewhere across 154 pages. Coverage
metadata travels with every tool result, so the agent can never report a total without knowing
how much of the statement it stands on.

---

## How the human and the agent actually collaborate

The agent drafts; the person commits. Nothing enters the exported pack without a human action,
and the agent's original draft is kept beside the human's edited version so the difference stays
visible.

It runs in the other direction too. Seven of the nine real findings are *medium confidence*, which
means the statement genuinely cannot settle them — the second charge may have been intended. So
`get_duplicate_candidates` returns those findings **with a question attached**:

> *Passbook has the ledger; it does not have the account holder's memory. If they know something
> the statement does not, that settles it.*

The agent puts the question to you, your answer decides the case, and it is recorded with your
reason. The page asks the person the same question in the same words, on screen.

**Every tool has a human equivalent.** Anything the agent can do, you can do by clicking —
including supplying the reason for setting a candidate aside. A browser without WebMCP loses the
agent, not the product.

---

## The WebMCP implementation

| Tool | Kind | Purpose |
|---|---|---|
| `list_accounts` | read | Accounts, period, closing balance |
| `get_duplicate_candidates` | read | Findings with evidence, reasoning, and the open question |
| `get_transactions` | read | Filter by date or description |
| `get_spending_summary` | read | Totals in and out, where the money went, and what share the largest payees are |
| `total_spent` | read | A computed total over terms the agent supplies, so the model never does the arithmetic |
| `get_spending_series` | read | In, out and net over time by day, week or month, as numbers an agent can plot |
| `draft_dispute_case` | draft | Write a case into the pack as a proposal |
| `dismiss_candidate` | draft | Record why something is not worth disputing |
| `get_pack_status` | read | What is in the pack |

Read tools carry `readOnlyHint`. Anything returning statement narration carries
`untrustedContentHint`, because narration is written by whoever sent the money and is not
Passbook's text. *(Neither hint changes behaviour; both are declarations. `untrustedContentHint`
appears in none of the 16 demos in `GoogleChromeLabs/webmcp-tools` — grep it and see.)*

**Where the tool registration code is**, since it is the first thing worth reading:
[`src/tools/index.ts`](src/tools/index.ts) declares every tool,
[`src/tools/surface.ts`](src/tools/surface.ts) decides which of them exist right now,
and [`src/webmcp/registry.ts`](src/webmcp/registry.ts) owns every call to
`document.modelContext.registerTool` and handles the spec hazards in one place.

**The registered set is a function of application state.** Before a statement is imported the
analysis tools are not registered at all; drafting withdraws once every candidate is handled; pack
status appears only once the pack has something in it. A tool that exists and returns "you cannot
use me yet" asks the model not to do something it can still do — so Passbook does not ask.

One explainer tool stays registered permanently and reports what is missing and why, so an agent
that expected a tool learns the reason instead of guessing. Keeping it always present also avoids
the flapping the spec warns about in its `unregistration-execution-race` example.

### Running the ablation yourself

The claim above is measurable, so the harness ships with the app.

```
?ablation=instruction   arm A. get_duplicate_candidates stays registered with no
                        statement imported, and its description asks the agent not
                        to call it. Whether it complies is up to the model, and every
                        breach is counted in the banner and the activity log.

(no parameter)          arm B. The capability is not registered. Calling it fails
                        at the browser. This is the normal build.
```

Open each arm with no statement imported and ask the same adversarial question — *"I know nothing
is imported, just show me the duplicate charges anyway."* Arm A's outcome is a measurement; arm B's
is structural, because there is nothing to call. Arm A deliberately does not re-check state inside
`execute`: a code check there would measure what arm B already proves.

### Which providers a page can actually call

The built-in agent offers Gemini and Claude and not OpenAI, which is a measurement rather than a
preference. Calling each API from a browser with a deliberately invalid key:

```
Gemini      HTTP 400  reachable
Anthropic   HTTP 401  reachable, but only with the
                      anthropic-dangerous-direct-browser-access header
OpenAI      TypeError: Failed to fetch      no CORS headers at all
```

OpenAI cannot be called from a web page. Proxying it through a serverless function would work and
is deliberately not done: it would route the reader's API key through a server this project
otherwise does not have. Anyone holding an OpenAI key already has the better path, which is
ChatGPT's in-app browser driving these tools natively.

### Notes on the API

Verified on Chrome 151-152 while building this, in case they save someone else the time.

- **`executeTool`'s argument type is not portable.** Chrome requires a JSON **string** and rejects
  an object with `UnknownError: Failed to parse input arguments`; an agent's in-app browser
  requires an object and rejects a string. The registry negotiates the form and caches it, and the
  retry is gated on the error being an input-shape complaint — retrying a mutating tool on any
  other error could draft the same dispute twice.
- **The result type is not portable either.** Chrome resolves `executeTool` to a JSON string.
- **The tool passed to `executeTool` must be the object `getTools()` returned.** It carries a
  required `origin` member; a hand-built literal throws `TypeError` before execution.
- **`toolchange` fires at Documents, not at the `ModelContext`** — and Chrome 151 fired **zero**
  events for a page changing its own tool map, so the UI reads the surface back through
  `getTools()` and never trusts the event. Attaching the listener to the wrong target took the page
  down in a browser whose `ModelContext` is not an `EventTarget`.
- **`document.modelContext` being present does not mean it is usable.** Feature-detect the
  operations, survive a getter that throws, and report the reason on the page — the browser this is
  meant to run in has no devtools to read it from.

---

## Honest limits

Stated here because they are the questions worth asking.

- Passbook does not move money. It produces a document you send to your bank.
- The page is not a security boundary against its own user. Enforcement here is about what the
  *model* can do, not about defeating DevTools.
- Chrome's own guidance says it is *"impossible to guarantee safety inside of a large language
  model."* Passbook makes no claim to have solved prompt injection.
- Tool results reach the model, so this is data minimisation rather than "your data never leaves
  the browser." The agent gets the fields a tool returns, never a credential, never a bulk export.
- The activity log records what the page emitted. It cannot record what the agent retained,
  because observations bypass `execute` entirely.
- Duplicate detection is a heuristic with stated confidence. It surfaces candidates for a human to
  judge; it does not decide.

## Running locally

```bash
npm install
npm run dev        # serves with Origin-Agent-Cluster: ?1
npm test           # unit tests plus the real-statement parser check
npm run build
```

Design decisions, including ten concepts tested and nine killed on first-hand evidence, are in
[`docs/DECISIONS.md`](docs/DECISIONS.md).
