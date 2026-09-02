# Devpost submission

Paste-ready text for the entry form, plus the video plan. Nothing here may contradict the claims
discipline in `CLAUDE.md`.

- **Live URL:** https://passbook-webmcp.netlify.app
- **Repo:** https://github.com/vishalsg42/passbook-webmcp (MIT)
- **Video:** _(to record)_

## Field placement

Devpost's judges read the first three lines and the video. Everything below the fold is for the
ones who go deeper — so the order matters more than the length.

Judges are **not required to run the project**. The video is therefore the primary artifact, not
a supplement to it.

---

## Tagline

It reads every row of your statement and finds the few worth a second look.

---

## Description

**A year of your money is 154 pages, and nobody reads it.** So the standing
instructions carry on, the money goes where you half-remember it going, and the
things worth two minutes of your attention are buried on page 91.

Passbook reads it. All of it, in the tab: 1,630 rows parsed of 1,630 detected,
every one reconciled against the statement's own printed running balance, 100%
bank-reference coverage. Then your own agent can ask it anything, because the
page holds the ledger and does the arithmetic while the agent handles the
question.

### Built on real statements, not fixtures

| | |
|---|---|
| Real HDFC statement | 154 pages, 1,630 rows |
| Parsed | 1,630 of 1,630, zero failures, 100% bank-reference coverage |
| Running-balance chain | intact end to end |
| Also parsed | Kotak Mahindra (107 rows), RBL (143), plus a CSV path for any bank |
| Fixed-amount recurring merchants found | **10** |
| Candidate pairs worth a second look | **9** out of 1,630 rows |
| Of those, confirmed bank errors | **0** — every one was a payment the owner meant to make |

**That last row is why this submission says what it says.** An earlier version
of Passbook led with "it found the money you already lost". Then the nine
candidates were audited against the account holder's own knowledge, and all nine
were intentional. The postings are real — the balance chain reconciles across
every pair, and four are adjacent rows where the balance falls by that amount
twice in succession — so the detector was not inventing anything. It simply
cannot see intent, and no ledger can.

So Passbook does not claim to find duplicate charges. It claims to read 1,630
rows and hand back the nine worth checking, and to say plainly that only you can
settle them. A tool that told you it had found money would have been wrong nine
times out of nine here.

### What it actually gives you

**Where the money went.** Counterparties ranked by spend, how many payments
each, and what share of everything that left the account they account for. Pure
arithmetic over reconciled rows; no guess about intent required.

**What leaves before you look.** Standing commitments that debit an identical
amount repeatedly, annualised from the observed cadence rather than an assumed
monthly one. The amount on the row is what leaves each time; the number that
changes anyone's mind is what it comes to in a year, and nobody performs that
multiplication while reading a PDF.

**The few worth checking.** Same counterparty, same amount, days apart,
different bank references, not reversed, not a recurring arrangement. A naive
`(date, amount, merchant)` match returns **367 pairs** on this statement — 222
from one investment platform, 110 from another, all instalment plans. Nine
survive. Getting from 367 to 9 is the work.

**And you can just ask.** "How much did I spend on food?" The agent decides
Swiggy is food; `total_spent` does the summing over reconciled rows and returns
the terms it counted, so the number is computed rather than a model's mental
arithmetic. That distinction is the whole architecture.

### The human and the agent both hold a pen

Seven of the nine candidates are ones the statement genuinely cannot settle. So
`get_duplicate_candidates` returns them **with a question attached** — *Passbook
has the ledger; it does not have the account holder's memory.* The agent puts it
to you, your answer decides the case, and it is recorded with your reason. The
page asks the person the same question, in the same words, on screen.

**Every tool has a human equivalent.** Anything the agent can do, you can do by
clicking. A browser without WebMCP loses the agent, not the product — and the
WebMCP polyfill from Chrome's own demo collection means the tools work anywhere.

### The WebMCP implementation

Eight tools, and the registered set is a function of application state rather
than a fixed catalogue: before a statement is imported, the analysis tools are
**not registered at all**. Drafting withdraws once every candidate is handled. A
tool that exists and returns "you cannot use me yet" asks the model not to do
something it can still do — so Passbook does not ask, and the page ships a live
ablation of that exact difference at `?ablation=instruction`.

Read tools carry `readOnlyHint`; anything returning statement narration carries
`untrustedContentHint`, because that text was written by whoever sent the money.
Neither hint changes behaviour — both are declarations to the agent.
`untrustedContentHint` appears in none of the 16 demos in
`GoogleChromeLabs/webmcp-tools`.

Several implementation details are measurements rather than assumptions:

- **`executeTool`'s argument type is not portable.** Chrome requires a JSON
  string and rejects an object; an agent's in-app browser requires an object and
  rejects a string. The registry negotiates and caches the form, and the retry is
  gated on the error being an input-shape complaint — retrying a mutating tool on
  any other error could draft the same dispute twice.
- **Gemini 3 rejects a follow-up request that omits the `thoughtSignature`** it
  attached to a `functionCall` part, so the built-in agent could call exactly one
  tool and then die. Each turn now keeps the provider's own representation of its
  reply and replays it unchanged, rather than rebuilding an equivalent-looking one.
- **Chrome fired zero `toolchange` events** for a page changing its own tool map,
  so the UI reads the surface back through `getTools()` and never trusts the
  event. `toolchange` fires at Documents, not at the `ModelContext`.
- **`document.modelContext` being present does not mean it is usable**, so the app
  feature-detects the operations, survives a getter that throws, and reports the
  reason on the page — the browser this is meant to run in has no devtools.
- **OpenAI's API sends no CORS headers**, so no web page can call it. Measured,
  not assumed: Gemini answers 400 to an invalid key and Anthropic 401, while
  OpenAI fails with `TypeError: Failed to fetch`. The built-in agent therefore
  offers Gemini and Claude, and is not proxied through a serverless function —
  that would route the reader's API key through a server this project does not
  otherwise have.

### On privacy, precisely

Parsing happens in the tab, and the agent receives only the field set a tool
chose to return — the Activity panel lists those exact fields, per call, so you
can check it. That is data minimisation, not secrecy: tool results do reach the
model. Statement passwords go straight to the pdf.js worker and are never stored
or logged. No real statement is in the repo.

Two leaks were found and closed while building, both worth stating because they
are the kind that stay hidden: `merchantKey` cannot name a cash withdrawal, so it
returned the masked card number and would have sent it to the agent through
`get_spending_summary`; and Chrome ignored `autocomplete="off"` on the provider
key field, autofilled a saved password into it, and the change handler wrote that
to `sessionStorage`.

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

Record on the **seeded demo statement**, never the real one: the real statements
name the owner's actual counterparties.

**Two sets of numbers, and they must never be blurred.** On screen you will have
the demo: 30 rows, 2 candidates, 6 counterparties at 83%, about ₹96,500 a year in
standing commitments. The real statement's figures — 154 pages, 1,630 rows, 9
candidates, 0 confirmed errors — are yours to say out loud, attributed to the
real statement. Say a real number over a demo screen without saying which is
which and the whole submission's honesty argument goes with it.

**The one thing to get right:** the strongest beat in this submission is that the
tool found nothing, and says so. Almost every entry in this hackathon will claim
its thing works. Saying *"I checked all nine and every one was a payment I meant
to make — that is why this does not say it found your money"* is the most
credible thirty seconds available to you, and nobody else can say it because
nobody else has real data to be wrong about. Do not cut it for time.

Four takes.

| Time | Shot | Say |
|---|---|---|
| 0:00–0:25 | **Cold open on the scale.** Scroll the statement view fast, then stop on "Where your money went" — six counterparties, 83%, and the standing commitments line with the yearly figure. No logo, no tour, no "hi". The header reads *Demo statement (sample data)*; leave it visible. | "A year of my bank statement is 154 pages and 1,630 rows. I have never read it. Passbook parsed every one of them and checked each against the printed running balance. What you're seeing is a sample — but this is what reading all of it gets you. Six counterparties are 83% of everything that left the account. And about ₹96,500 a year goes out on standing instructions I set up once and stopped thinking about." |
| 0:25–1:05 | **Ask it something real.** Type *"How much did I spend on food?"* into the agent panel. The `total_spent` chip appears, then the answer. | "It decided Swiggy counts as food. It did not add the numbers up — the page did that, over rows it had already reconciled. The model picks what counts; the page says what it costs. That is the whole architecture." |
| 1:05–1:55 | **The honest part — the beat that matters.** Ask *"Which charges look like I was billed twice?"* The evidence comes back with Passbook's question attached. Answer it out loud. The row leaves the list and your reason is recorded. | "Two here out of thirty. On my real statement it was nine out of sixteen hundred — and here it is asking me something the statement genuinely cannot answer. So I checked all nine. Every single one was a payment I meant to make. Nothing was wrong. That is exactly why this doesn't tell you it found your money: it tells you what it can't know, and asks." |
| 1:55–2:25 | **Mechanism, briskly.** The Tools counter in the header ticking down as you settle candidates; open Activity and show the field chips. | "The tools an agent can call here depend on what has happened. Before a statement is loaded these do not exist — not disabled, not registered. And this lists the exact fields each call returned, so 'data minimisation' is something you can check rather than something I claim." |
| 2:25–2:50 | **Limits, out loud.** | "Tool results reach the model, so this is data minimisation, not secrecy. Chrome's own guidance says you cannot guarantee safety inside a language model, and I am not claiming to have. And the duplicate detector is a filter, not a verdict." |

**Do not open on the tool surface, revocation, or approval-gating.** They are the
most crowded framings in this field and a secondary treatment loses to someone
whose entire entry is that idea. Open on the scale of what was read.

**Do not say "found", "recovered", "owed back", or "duplicate charge" about the
real statement.** The audit in `docs/DECISIONS.md` is the reason.
