# Devpost submission

Paste-ready text for the entry form, plus the video plan. Nothing here may contradict the claims
discipline in `CLAUDE.md`.

> **FREEZE AFTER SUBMISSION.** The rules are explicit: once the Submission Period
> ends you may not alter the submission, and the project must stay live, public
> and working **until judging ends on 21 September, 5:00 PM PT** — and must
> "function as depicted in the video and/or expressed in the text description".
> So after submitting: no commits, no `netlify deploy`, no re-recording, and do
> not take the site down. To keep building, fork and work in the copy.

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
the delivery merchant is food; `total_spent` does the summing over reconciled rows and returns
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

### The four things the rules ask a description to address

Answered head-on, because they are the rubric.

**Why WebMCP is a strong fit here.** A bank statement is the worst possible
thing to hand a model: 154 pages, 1,630 rows, and every figure load-bearing. Upload
the PDF and the model reads what it can and quietly miscounts the rest. WebMCP
inverts it — the page keeps the ledger, parses it deterministically, reconciles
every row against the printed running balance, and exposes *questions the agent
can ask* rather than a document it has to skim. The agent brings intent and
language; the page brings arithmetic that is either right or fails a checksum.
Neither could do this alone, and no backend could do it without being handed the
statement first.

**How it improves the experience.** You stop reading. A year of transactions
becomes something you interrogate in your own words — "how much did I spend on
food", "what leaves on autopilot" — and get an answer computed over reconciled
rows rather than estimated from a sample. The agent receives only the field set a
tool returned, and the Activity panel lists those fields per call, so the
minimisation is checkable rather than promised.

**What the two can now do together that neither could before.** The page can
narrow 1,630 rows to nine worth a look, and it can prove they are worth it —
both dates, both bank references, the reversal it ruled out. What it cannot do
is know whether you meant to pay twice. So `get_duplicate_candidates` returns
those findings **with a question attached**, the agent puts it to you in its own
words, and your answer is what settles the case and gets recorded with it. A
ledger that asks, a person who answers, and a document neither wrote alone. That
loop is not expressible without a tool surface living inside the page that holds
the data.

**How WebMCP is actually integrated.** Below.

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

## Testing instructions (paste into the Devpost field)

**No login, no credentials, nothing to install.** A demo statement loads by
itself, so the live URL works the moment it opens.

**Either agent browser works.** Open <https://passbook-webmcp.netlify.app> in
Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled, or in ChatGPT's
in-app browser, and ask in your own words. Starting points are on the page as
one-press chips:

- *"Where did my money actually go?"*
- *"How much did I spend on food?"*
- *"What standing commitments do I have, and what do they come to in a year?"*
- *"Is anything here worth a second look? Show me the evidence."*

**If the page will not open in your agent browser at all,** that is on the
browser's side rather than this app's — verified on the deployed origin from
Chrome 152, where `getTools()` returns 8 tools and `executeTool` runs them.
Passbook is built so that costs you the agent and never the product, so any of
the following still gives you the whole thing:

**Three fallbacks, all on the same page.** Passbook
loads the WebMCP polyfill from Chrome's own demo collection, so the tools are
live in any browser: add `?nowebmcp` to force that path and see it. There is a
bring-your-own-key agent that takes a Gemini or Anthropic key and drives the same
tools through the same registry. And a tool console that calls `getTools()` and
`executeTool()` directly, so you can invoke anything by hand and read the raw
result.

**To watch the tool surface follow application state:** open **Tools** in the
header and keep it in view. Settle both candidates and the count drops as
`draft_dispute_case` and `dismiss_candidate` unregister themselves; switch the
header to *My statement* and it falls to two. Calling a tool that is no longer
registered fails with `UnknownError` from the browser, not a refusal from us.

**To check the parser rather than trust it:** switch to *My statement* and press
**Load a sample statement**. It goes through the same function a dropped file
does — column detection, balance-chain validation, real coverage numbers — and
the activity log records it as *Imported*, not *Loaded the demo*.

**To see the ablation:** add `?ablation=instruction` with no statement imported.

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
| 0:25–1:05 | **Ask it something real.** Type *"How much did I spend on food?"* into the agent panel. The `total_spent` chip appears, then the answer. | "It decided the delivery merchant counts as food. It did not add the numbers up — the page did that, over rows it had already reconciled. The model picks what counts; the page says what it costs. That is the whole architecture." |
| 1:05–1:55 | **The honest part — the beat that matters.** Ask *"Which charges look like I was billed twice?"* The evidence comes back with Passbook's question attached. Answer it out loud. The row leaves the list and your reason is recorded. | "Two here out of thirty. On my real statement it was nine out of sixteen hundred — and here it is asking me something the statement genuinely cannot answer. So I checked all nine. Every single one was a payment I meant to make. Nothing was wrong. That is exactly why this doesn't tell you it found your money: it tells you what it can't know, and asks." |
| 1:55–2:25 | **Mechanism, briskly.** The Tools counter in the header ticking down as you settle candidates; open Activity and show the field chips. | "The tools an agent can call here depend on what has happened. Before a statement is loaded these do not exist — not disabled, not registered. And this lists the exact fields each call returned, so 'data minimisation' is something you can check rather than something I claim." |
| 2:25–2:50 | **Limits, out loud.** | "Tool results reach the model, so this is data minimisation, not secrecy. Chrome's own guidance says you cannot guarantee safety inside a language model, and I am not claiming to have. And the duplicate detector is a filter, not a verdict." |

**Do not open on the tool surface, revocation, or approval-gating.** They are the
most crowded framings in this field and a secondary treatment loses to someone
whose entire entry is that idea. Open on the scale of what was read.

**Do not say "found", "recovered", "owed back", or "duplicate charge" about the
real statement.** The audit in `docs/DECISIONS.md` is the reason.

**Every counterparty in the demo is invented, and must stay that way.** The rules
exclude third-party trademarks from the video, and the seed originally named
three real Indian businesses — one of which appeared beside a row headed "paid
the same amount twice", which implies something about a named company that is not
true of it. Renamed 2026-09-02.
