# Devpost submission

Paste-ready text for the entry form, plus the video plan. Nothing here may
contradict the claims discipline in `CLAUDE.md`.

- **Live URL:** https://passbook-webmcp.netlify.app
- **Repo:** https://github.com/vishalsg42/passbook-webmcp (MIT)
- **Video:** _(to record)_

---

## Tagline

It found the money you already lost, and wrote the letter to get it back.

---

## Description

**The problem.** Banks double-charge people, and almost nobody catches it. The
evidence is buried in a 154-page PDF, the charges are weeks apart, and the
dispute letter is enough work that most people decide the money is gone. It
usually is.

**What Passbook does.** You give it a bank statement. It parses the PDF in the
tab, reconciles every row against the printed running balance, and finds the
charges you paid twice. Then you and your agent write the dispute letters
together, and the page exports a pack you can send.

Built and calibrated on **real statements**, not fixtures: 1,630 HDFC rows with
100% reference-column coverage, plus Kotak and RBL, and a CSV path for any other
bank. On that year it finds **nine duplicate charges** — two the evidence
settles outright, seven it cannot. A demo statement loads automatically so the
live URL works with nothing uploaded.

**Why the findings can be trusted.** Duplicate detection is keyed on the bank
reference column, not on `(date, amount, merchant)`, which fires constantly on
legitimate repeat payments. Reversal pairs are excluded: a debit with a matching
later credit was already refunded, and putting one in a list headed "money you
lost" is the worst available mistake. A merchant that bills the same amount more
than twice is a standing arrangement, not an accident — on the real statement,
two investment platforms alone would contribute **334 matched pairs** without
that rule (224 and 110), none of them errors. Requiring the amount to be
unusual *for that counterparty* is what separates the accident from the habit.
Every tool result carries coverage metadata (rows parsed of rows
detected, balance chain intact) so the agent can never report a total without
knowing how much of the statement it stands on. Money is integer paise
throughout; there is no float in the money path.

**How the human and the agent actually collaborate.** The agent drafts; the
person commits. Nothing enters the final pack without a human action, and the
agent's original draft is kept beside the human's edit so the difference stays
visible. It runs in the other direction too: because "medium confidence" means
the statement genuinely cannot settle a candidate,
`get_duplicate_candidates` returns those findings **with a question attached** —
*Passbook has the ledger; it does not have the account holder's memory.* The
agent asks you, you answer, and the answer decides the case. The page and the
person are asked the same question, in the same words.

**Every tool has a human equivalent.** Anything the agent can do, you can do by
clicking, including supplying the reason for setting a candidate aside. That is
the test of whether this is a product or a tool demo.

**WebMCP implementation.** Seven tools, and the registered set is a function of
application state rather than a fixed catalogue: before a statement is imported
the analysis tools are **not registered at all**. A tool that exists and replies
"you cannot use me yet" is enforcement by instruction, and the page ships a
live ablation of exactly that — add `?ablation=instruction` to the URL to
register the guarded tool with its guard written only in prose, and watch the
breach counter. Revocation is provable from the page: call a tool that is no
longer registered and the browser rejects with `UnknownError`, not a refusal
from us.

Several things in the implementation are measurements rather than assumptions,
and the reasoning is in the source:

- `executeTool`'s argument type is **not portable**. Chrome 151 requires a JSON
  string and rejects an object; an agent's in-app browser requires an object and
  rejects a string. The registry negotiates the form and caches it, and the
  retry is gated on the error being an input-shape complaint, because retrying a
  mutating tool on any other error could draft the same dispute twice.
- Chrome 151 fires **zero** `toolchange` events for a page changing its own tool
  map, so the UI reads the surface back through `getTools()` and never trusts the
  event. `toolchange` fires at Documents, not at the `ModelContext`; attaching
  the listener to the wrong target took the page down in a browser whose
  `ModelContext` is not an `EventTarget`.
- `document.modelContext` being present does not mean it is usable, so the app
  feature-detects the operations, survives a getter that throws, and reports the
  reason on the page — because the browser this is meant to run in has no
  devtools to read it from.

**On privacy, precisely.** Parsing happens in the tab, and the agent receives
only the field set a tool chose to return — the Activity panel lists those exact
fields, per call, so you can check it. That is data minimisation, not secrecy:
tool results do reach the model. Statement passwords go straight to the pdf.js
worker and are never stored or logged.

---

## What was cut, and why

Recorded in full in `docs/DECISIONS.md`. Ten concepts were tested and nine
killed on first-hand evidence. The last one is worth stating here because it was
working code:

**Session-authored tools** — the page publishing a new tool learned from
decisions you and your agent made together. Verified working on Chrome 151:
runtime `registerTool` appears in `getTools()`, executes, and revokes. Cut
anyway, because it fires only when the same decision is made twice about the
same counterparty, and re-measuring all three real statements found **no repeat
offender at all** — nine findings across nine distinct merchants. Demoing it
would have meant writing seed rows to fit the feature, on a project whose whole
claim is that the data is real.

---

## Video plan (under 3:00, with audio)

| Time | Shot |
|---|---|
| 0:00–0:15 | Cold open on the number. Real bank, real duplicate, real amount. No tour, no logo. |
| 0:15–0:50 | Ask the agent for duplicates. It returns the evidence **and Passbook's question** about the ones the statement cannot settle. Answer it out loud. |
| 0:50–1:30 | The agent drafts a dispute letter. Edit one line, reject another. "You edited the letter the agent drafted" on screen. |
| 1:30–1:55 | Export the pack. A real document, from a real statement, ready to send. |
| 1:55–2:25 | Mechanism: the tool list shrinking and growing with state; Activity showing the exact fields each call emitted; Start over → the surface drops to two tools and a stale call fails at the browser. |
| 2:25–2:50 | Limits, said out loud: tool results reach the model, so this is data minimisation. Chrome's own line that it is "impossible to guarantee safety inside of a large language model." |

Record on the **seeded demo statement**, never on the real one. Merchant names
in the real statements are the owner's actual counterparties.
