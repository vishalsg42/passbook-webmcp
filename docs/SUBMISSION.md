# Devpost submission

Paste-ready text for the entry form, plus the video plan. Nothing here may contradict the claims
discipline in `CLAUDE.md`.

- **Live URL:** https://passbook-webmcp.netlify.app
- **Repo:** https://github.com/vishalsg42/passbook-webmcp (MIT)
- **Video:** _(to record)_

## Field placement

Devpost's judges read the first three lines and the video. Everything below the fold is for the
ones who go deeper — so the order matters more than the length.

---

## Tagline

It reads every row of your statement and finds the few worth a second look.

---

## Description

**Banks double-charge people, and almost nobody catches it.** The evidence is buried in a
154-page PDF, the two charges are weeks apart, and the dispute letter is enough work that most
people decide the money is gone. It usually is.

Passbook is an agent that reads your actual bank statement, finds the charges you paid twice, and
writes the dispute letters with you.

### Built on real statements, not fixtures

| | |
|---|---|
| Real HDFC statement | 154 pages, 1,630 rows |
| Parsed | 1,630 of 1,630, zero failures, 100% bank-reference coverage |
| Running-balance chain | intact end to end |
| Also parsed | Kotak Mahindra (107 rows), RBL (143), plus a CSV path for any bank |
| Duplicate charges found | **9** across the year — 2 the evidence settles, 7 it cannot |
| False positives one rule suppresses | **367 candidate pairs** |

That last row is the product. A naive `(date, amount, merchant)` match returns 367 pairs on this
statement — 222 from a single investment platform, 110 from another. They are instalment plans,
not errors. Getting from 367 to 9 is the work.

Every rule is readable in the source. Detection is keyed on the **bank reference column**, not on
date-plus-amount, because two charges sharing a reference are one posting seen twice. **Reversal
pairs are excluded** — a debit with a matching later credit was already refunded, and putting one
in a list headed "money you lost" is the worst available mistake. A merchant billing the same
amount more than twice is a **standing arrangement, not an accident**. Money is integer paise
throughout; there is no float in the money path.

A demo statement loads automatically, so the live URL works with nothing uploaded.

### The human and the agent both hold a pen

The agent drafts; the person commits. Nothing enters the exported pack without a human action, and
the agent's original draft is kept beside the human's edit so the difference stays visible.

It runs the other way too. Seven of the nine findings are *medium confidence*, which means the
statement genuinely cannot settle them. So `get_duplicate_candidates` returns those findings
**with a question attached** — *Passbook has the ledger; it does not have the account holder's
memory.* The agent asks you, your answer decides the case, and it is recorded with your reason.
The page puts the same question to the person on screen, in the same words.

**Every tool has a human equivalent.** Anything the agent can do, you can do by clicking. A
browser without WebMCP loses the agent, not the product.

### The WebMCP implementation

Seven tools, and the registered set is a function of application state rather than a fixed
catalogue: before a statement is imported, the analysis tools are **not registered at all**.
Drafting withdraws once every candidate is handled. A tool that exists and returns "you cannot use
me yet" asks the model not to do something it can still do — so Passbook does not ask, and the
page ships a live ablation of that exact difference at `?ablation=instruction`.

Read tools carry `readOnlyHint`; anything returning statement narration carries
`untrustedContentHint`, because that text was written by whoever sent the money. Neither hint
changes behaviour — both are declarations to the agent.

Several implementation details are measurements rather than assumptions, and the reasoning is in
the source:

- **`executeTool`'s argument type is not portable.** Chrome requires a JSON string and rejects an
  object; an agent's in-app browser requires an object and rejects a string. The registry
  negotiates the form and caches it, and the retry is gated on the error being an input-shape
  complaint — retrying a mutating tool on any other error could draft the same dispute twice.
- **Chrome fired zero `toolchange` events** for a page changing its own tool map, so the UI reads
  the surface back through `getTools()` and never trusts the event. `toolchange` fires at
  Documents, not at the `ModelContext`; attaching the listener to the wrong target took the page
  down in a browser whose `ModelContext` is not an `EventTarget`.
- **`document.modelContext` being present does not mean it is usable**, so the app feature-detects
  the operations, survives a getter that throws, and reports the reason on the page — the browser
  this is meant to run in has no devtools to read it from.

### On privacy, precisely

Parsing happens in the tab, and the agent receives only the field set a tool chose to return — the
Activity panel lists those exact fields, per call, so you can check it. That is data minimisation,
not secrecy: tool results do reach the model. Statement passwords go straight to the pdf.js worker
and are never stored or logged. No real statement is in the repo.

---

## What was cut, and why

Recorded in full in `docs/DECISIONS.md`: ten concepts tested, nine killed on first-hand evidence.
The last is worth stating because it was working code.

**Session-authored tools** — the page publishing a new tool learned from decisions you and your
agent made together. Verified working on Chrome 151: runtime `registerTool` appears in
`getTools()`, executes, and revokes. Cut anyway, because it fires only when the same decision is
made twice about the same counterparty, and re-measuring all three real statements found **no
repeat offender at all** — nine findings across nine distinct merchants. Demoing it would have
meant writing seed rows to fit the feature, on a project whose whole claim is that the data is
real.

---

## Video plan — under 3:00, with audio

Record on the **seeded demo statement**, never the real one: the real statements name the owner's
actual counterparties.

Three takes, not six. The cold open is the whole ballgame — a judge watching hundreds of these
decides in fifteen seconds whether this is another toy.

| Time | Shot | Say |
|---|---|---|
| 0:00–0:20 | **Cold open on the money.** The findings list, the amount, the two charges side by side with their different bank references. No logo, no tour, no "hi, this is". | "This is a real bank statement. These two charges are the same merchant, the same amount, two days apart, different reference numbers. Nobody caught it. That's the normal outcome." |
| 0:20–1:00 | Ask the agent: *"Which charges look like I was billed twice? Show me the evidence."* It returns the evidence **and Passbook's question** about what the statement can't settle. Answer it out loud. | "It's asking me something the statement can't answer. Passbook has the ledger. It doesn't have my memory." |
| 1:00–1:45 | The agent drafts the dispute letter. Edit a line. The pack shows *"You edited the letter the agent drafted."* Export. | "The agent wrote this. I changed it. Both versions are kept, and only my press puts it in the pack." |
| 1:45–2:15 | Mechanism, quickly: the tool count changing with state, Activity showing the exact fields each call emitted. | "The tools an agent can call here depend on what's happened. Before a statement is loaded, these don't exist — not disabled, not registered." |
| 2:15–2:45 | Limits, said out loud. | "Tool results reach the model, so this is data minimisation, not secrecy. Chrome's own guidance says you can't guarantee safety inside a language model, and I'm not claiming to have." |

**Do not open on the tool surface, revocation, or approval-gating.** They are the most crowded
framings in this field and a secondary treatment loses to someone whose entire entry is that idea.
Open on the money.
