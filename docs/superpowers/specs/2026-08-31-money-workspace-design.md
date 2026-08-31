# Passbook — Design

**Date:** 2026-08-31
**Deadline:** 2026-09-03, 13:00 PT (hard — no late entries, no post-deadline edits)
**Context:** Submission for The WebMCP Challenge (Devpost, sponsored by OpenAI)

---

## 1. What this is

A personal money workspace where an AI agent audits your transactions, proposes fixes,
and **loses the ability to move money the moment your rules say it shouldn't have it.**

The agent finds the subscription that quietly price-hiked, the duplicate charge, and the
bill that will overdraft you on Tuesday. It stages a batch of fixes. You approve them in
one pass. When it tries a transfer past your daily limit, the transfer tool is
*unregistered* — it does not get told "please don't", the capability is withdrawn.

## 2. Why this shape

Established by research during concept selection (all verified first-hand):

- **The money domain is whitespace.** Zero finance apps across ~40 first-party and sponsor
  WebMCP demos (Chrome Labs' 15, OpenAI's, Netlify's, Cloudflare, Vercel, Shopify). Every
  money-adjacent demo is a shopping cart.
- **Approval-gating is commodity.** It is spec Goal #1 verbatim, it is in Chrome's docs,
  Cloudflare's docs, Netlify's hackathon blog, and ChatGPT's shipped client behaviour.
  Therefore: **never lead the pitch with approval.** Lead with revocation and with the
  concrete money found.
- **Live capability revocation is not commodity.** A backend MCP server exposes a static
  tool list per session; it structurally cannot do this. Most entries will register a
  static tool list at load and never touch it again.

### Positioning (non-rubric goals)

- Reusable asset: the staging + revocation layer is written as a **self-contained module**
  (`src/webmcp/`) with no app-specific imports, so it can be extracted post-deadline as a
  standalone open-source package. **Do not extract it before the deadline.**
- Learning: exercises dynamic registration, `toolchange`, annotations, and the full
  execute lifecycle rather than a static read-only tool list.

## 3. Judging alignment

Four equally weighted criteria. Where each is earned:

| Criterion | Earned by |
|---|---|
| WebMCP Leverage | Live capability revocation; credential-free delegation; policy enforced in code not prose |
| Execution | Balances consistent after approve/reject; state survives reload; every tool has a human UI equivalent |
| Potential Impact | Real CSV/PDF import — the audit runs on the user's actual statement |
| Creativity & Ambition | The only money app in a field of storefronts; the revocation mechanic |

**Framing rule (important).** Claim: *the page is the enforcement surface the model cannot
argue with.* Do **not** claim: "the page holds the rules" (defeated by DevTools), "prompt-injection
proof" (Chrome has publicly declined to make that claim), or "your data never leaves the browser"
(false — tool results reach the model). The honest privacy claim is **data minimisation**: the agent
receives the specific fields a tool returns, never a credential, never a bulk export, never an API scope.

## 4. Scope

**In:**
- Seeded ledger: 2 accounts, ~18 months of transactions, payees, bills, subscriptions
- CSV statement import (mandatory)
- PDF statement import for 1–2 named banks (built last, first to be cut)
- Rules: daily transfer limit, per-payee cap, payee allowlist
- Staging queue with per-change diffs, approve/reject
- Dynamic registration/unregistration of mutating tools
- Audit log including blocked and rejected attempts
- ~12 registered tools

**Out (explicitly cut):**
- Cooling-off windows for new payees
- Rule-editor UI (rules are changed via `stage_limit_change`, which is itself approved)
- Recurring payment scheduling
- Auth, multi-user, mobile layout, real payment rails
- Any backend

## 5. Architecture

Single-page app. No backend, no auth. React + Vite + TypeScript. Deployed to Netlify.
Currency: INR (₹).

```
src/
  webmcp/          # extraction candidate — no app-specific imports
    registry.ts    # register/unregister, AbortController per revocable tool
    staging.ts     # staged change lifecycle
    stubs.ts       # explainer stubs installed on revoke
  domain/
    ledger.ts      # accounts, transactions, balances (double-entry)
    rules.ts       # policy evaluation — returns {allowed, reason}
    audit.ts       # append-only log
  import/
    csv.ts
    pdf/<bank>.ts  # per-bank templates over pdf.js
  ui/              # workspace, approval queue, policy panel, audit log
  tools/           # tool definitions; thin wrappers over domain/
```

Persistence: `localStorage`, versioned key. **State must survive reload** — a demo that
resets on refresh reads as a prototype.

**Invariant:** every tool's `execute` calls the same domain function the UI buttons call.
No second implementation for the agent.

## 6. Data model

- **Account** — id, name, type (checking|savings), balanceMinor
- **Transaction** — id, accountId, date, merchant, amountMinor, category, source (seed|csv|pdf)
- **Payee** — id, name, accountRef, allowlisted (bool), perPayeeCapMinor
- **Bill** — id, payeeId, amountMinor, dueDate, status
- **Subscription** — id, merchant, amountMinor, cadence, firstSeen, lastAmountMinor
- **StagedChange** — id, type, payload, status (pending|approved|rejected|withdrawn), clientRef, createdAt
- **Policy** — dailyLimitMinor, defaultPerPayeeCapMinor, locked (bool)
- **AuditEntry** — ts, actor (human|agent), action, outcome (applied|rejected|blocked), reason

All money in **minor units (paise), integers**. No floats.

## 7. Tool surface

**16 listed; register 12–13.** A large tool surface degrades agent selection, and discovery
reliability on this API is already uneven. Ship the core first and add back only if selection
stays clean.

Trim order if the surface needs cutting: `stage_cancel_subscription` (fold into `stage_batch`
as a change type), then `withdraw_staged_change`. Do **not** cut `get_policy`,
`check_transfer_allowed`, or either revocable tool — those carry the Leverage score.

### Reads — `annotations: { readOnlyHint: true }`

| Tool | Purpose |
|---|---|
| `list_accounts` | Accounts and balances |
| `get_account_activity` | Transactions; filters: months, merchant, category, min/max |
| `list_payees` | Payees + allowlist status |
| `list_bills_due` | Upcoming bills. `untrustedContentHint: true` — descriptions are imported content |
| `list_subscriptions` | Detected subscriptions incl. amount history |
| `get_spending_summary` | Aggregates; groupBy merchant / category / month |
| `get_policy` | **The page tells the agent its own constraints.** Prose + structured |
| `check_transfer_allowed` | Dry-run of the rules engine. Read-only. Lets a well-behaved agent avoid doomed proposals |

### Mutations — `readOnlyHint: false`

No mutation applies directly. Every one creates a **StagedChange** that only a human commits.
How `execute` resolves differs by path — see §9.

| Tool | Purpose |
|---|---|
| `stage_batch` | **Primary path.** Array of changes → one batch id → one approval card. Returns immediately |
| `stage_transfer` | Single transfer. **Revocable**. Awaits the human decision |
| `stage_bill_payment` | Pay a bill. Awaits the human decision |
| `stage_add_payee` | Add a payee. **Revocable**. Awaits the human decision |
| `stage_cancel_subscription` | Cancel a subscription. Awaits the human decision |
| `stage_limit_change` | Change the rules — itself requires approval |
| `withdraw_staged_change` | Agent retracts its own proposal |
| `check_approval_outcome` | Outcome of a batch. Described as "call only if the user asks whether a change went through" — **not** a polling primitive |

### Tool description discipline

Chrome's published *guidance* (not spec, and marked subject to change): ≤500 chars per tool
description, ≤150 per parameter description, ≤30 per name, ≤1.5K per output. Spec hard limit
on tool names is 128 chars. Keep within guidance anyway — it helps tool selection.

## 8. The revocation mechanic

Each revocable tool is registered with its own `AbortController`:

```js
await document.modelContext.registerTool({ name: "stage_transfer", ... },
                                         { signal: transferController.signal });
```

When `rules.evaluate()` reports the daily limit is reached or the account is locked:

1. `transferController.abort()` → tool unregisters → `toolchange` fires at the agent.
2. **Immediately register an explainer stub in its place** — `explain_transfers_unavailable`,
   returning why and when it returns.

Unregistering into a *hole* makes agents hallucinate or retry. Unregistering into an
*explanation* makes them tell the user why. This is the single most important detail in the build.

Re-register the real tool when the condition clears.

## 9. Staging lifecycle

Two paths, deliberately:

- **Single action → await the promise.** Hold `execute` open until the human clicks approve,
  then resolve with the outcome. This is the pattern Cloudflare documents as canonical HITL,
  against Chrome Labs' hotel-chain demo. Two judges work at Chrome and Cloudflare.
- **Batch (≥2 changes) → staging queue.** Return immediately with a batch id; the human
  reviews all changes in one diff pass. Reviewing five changes at once genuinely beats five
  modal confirmations — this is the product argument nobody else is making.

**Anti-duplicate measures (a duplicate payment proposal on camera is the worst possible failure):**
- Every `stage_*` accepts an optional `clientRef`; dedupe on (type, target, amount, date) within
  a window and return the *same* change id with `status: "already_staged"`.
- Return strings must actively discourage polling. Not `"Staged as change #7."` Instead:
  *"Staged change #7. Waiting for the account holder to approve in the page. This is expected and
  final for you — do not poll; the human will act on it."*
- `check_approval_outcome` is described as "call only if the user asks whether a change went through" —
  it is not a polling primitive.

## 10. Import

**CSV (mandatory).** File input → parse → column-mapping step (date / description / amount /
balance) → normalise into Transaction. Handles debit/credit sign conventions.

**PDF (scoped, built last).** `pdf.js` text extraction + per-bank template in `import/pdf/<bank>.ts`.
Ship behind a clearly-labelled beta affordance. **Cut this before cutting anything in §7 or §8.**

Target banks, **in strict build order**: **HDFC → Kotak Mahindra → RBL.**
HDFC first on volume of available sample statements; each subsequent template ships only once
the previous one round-trips end to end.

Each template is independent work — layouts differ in column geometry, multi-line narration,
page headers/footers, and date formats. Budget ~2–3h for the first (includes the shared
`pdf.js` extraction harness) and ~1–1.5h each thereafter.

**Hard rule: template 2 and 3 are built only after §11 Definition of Done is fully green.**
One working template plus a green core beats three templates and an unfinished agent loop.
A parser earns zero judging points; the revocation mechanic in §8 is the submission.

**Dependency:** each template needs a real sample statement to calibrate against. Extract the
text layout locally (`pdf.js` → `getTextContent()`) and work from the *structure* — column
positions, header/footer patterns, date and narration formats. Do not paste real statement
contents into any external service; the parser runs entirely client-side and the sample never
needs to leave the machine.

Seeded data loads by default so judges can click through instantly without any import.

## 11. Definition of done

- [ ] Balances consistent after approve *and* after reject
- [ ] State survives page reload
- [ ] **Every tool has a human UI equivalent** — the coherence test
- [ ] Audit log shows blocked and rejected attempts, not just successes
- [ ] Revocation observable: tool disappears from the agent's list, stub explains why, tool returns when the condition clears
- [ ] Empty states and a reset-demo button
- [ ] CSV import works on a real statement
- [ ] Deployed public URL; feature-detects and degrades with a capability banner

## 12. Day-one checks (before any feature work)

1. **Tool invocation smoke test** — register one tool, confirm an external agent invokes it
   **twice consecutively** in both ChatGPT's in-app browser and Chrome-with-flag.
   *If this fails, pivot to the in-page agent (`getTools`/`executeTool`) or reconsider the concept.
   Make that call early, not at hour 30.*
2. **`Origin-Agent-Cluster: ?1`** — the spec rejects `registerTool`/`getTools`/`executeTool` with
   `SecurityError` if the agent cluster is not origin-keyed. Verify on the deployed origin. 10 minutes.
3. **Namespace feature-detection** — `document.modelContext ?? navigator.modelContext`.
   Live docs disagree about which namespace applies; do not assert any in the README.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Agent doesn't discover/invoke tools | Day-one gate; in-page agent fallback; iterate tool names and descriptions |
| Build overruns (~40–60h est. vs ~30 available) | Cut list in §4 already applied; PDF cut first |
| Reads as a permissions demo, not a product | Headline is "it found money I was losing", never "it refused a payment" |
| Duplicate staged changes on camera | §9 anti-duplicate measures |
| Mock money reads as inert | Real statement import; double-entry ledger; append-only audit log |

## 14. Video (judges may score on this alone; <3 min, audio required)

1. **0:00–0:20** — workspace, seeded and full. Establishes product before any WebMCP talk.
2. **0:20–1:20** — *"Find where I'm losing money."* Agent queries via tools; returns the
   price-hiked subscription, duplicate charge, imminent overdraft; stages five fixes;
   human approves four and rejects one; balances move.
3. **1:20–1:50** — *"Move ₹80,000 to a new account."* Blocked. **Cut to the tool list:
   `stage_transfer` is gone.** The agent explains it no longer has the capability.
4. **1:50–2:30** — CSV import on a real statement; one genuine finding.
5. **2:30–2:50** — architecture in one line: no credential ever reaches the agent. Repo, licence.

Drive refusals from **page UI** (a red BLOCKED card in the audit log), not from the agent's
narration — the page fires deterministically, the model may not.

## 15. Submission checklist

- [ ] Working public live URL
- [ ] Public repo with detectable OSS licence (MIT), visible in the About section
- [ ] Text description: WebMCP fit, what it enables, what was hard before, how WebMCP was implemented
- [ ] YouTube video, public, <3 minutes, with audio
- [ ] **After the deadline: do not touch the repo, the site, or the entry until winners are announced**

---

## Decisions made

- **Name:** Passbook. The ledger you keep — the agent proposes, the passbook records, you commit.
  (Apple retired its "Passbook" product name in 2015; the word is a generic banking term. Low risk,
  but do not style it like Apple's.)
- **PDF banks:** HDFC → Kotak Mahindra → RBL, in that build order, gated per §10.
- **Stack:** React + Vite + TypeScript; Netlify; localStorage; INR.

## Open decisions

- None blocking. Revisit tool-surface size after the day-one invocation smoke test (§12).
