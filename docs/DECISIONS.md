# Decisions

Why Passbook is what it is. Nine concept directions were tested; eight were killed on evidence
verified first-hand, not on taste. **Read this before proposing a pivot, the graveyard is well
documented and most obvious ideas are already in it.**

## The hackathon

The WebMCP Challenge (Devpost, sponsored by OpenAI). Registration and submission both close
**2026-09-03 13:00 PT**. Top 10 of an expected 450-800 submissions win. Four **equally weighted**
criteria: WebMCP Leverage, Execution, Potential Impact, Creativity & Ambition. Stage One is
pass/fail on theme fit and non-trivial API use.

Judges (verified on the Devpost page): Justin Rushing (Browser Platform Lead, OpenAI), Sarah
Drasner (Chrome), Ilya Grigorik (Shopify), Andrew Galloni (Cloudflare), Jude Gao (Vercel), Sean
Roberts (Netlify), Alex Nahas (creator of MCP-B). All infrastructure and platform people, domain
charm earns nothing; they read repos.

Judges are **not required to run the project** and may score from the description, repo, and a
sub-3-minute video alone.

## The graveyard

| # | Concept | Why it died |
|---|---|---|
| 1 | Agent-native music studio | OpenAI ships **Fieldwork Beat Machine**, a 26-tool drum machine, as a reference app |
| 2 | Asymmetric co-op game | Chrome Labs ships two games (`doors`, `webmcp-maze`); Netlify ships one; 25+ game entries already |
| 3 | Co-op game with a teaching frame | Scores *below* the unframed version, a claimed-then-collapsed impact story reads as spin |
| 4 | Cross-origin tool workbench | ChatGPT's in-app browser discovers **zero** iframe tools; you'd have to build your own agent to demo it, in the host sponsor's runtime. Also MCP-B's creator is judging |
| 5 | Accessibility-first app | Disputed, not unexplored: WebMCP issue **#91** is "Redundancy with the accessibility tree", the spec cites it in its own Goals, and the Accessibility Considerations section is empty |
| 6 | Local-first privacy app | Core claim false, a **local stdio MCP server reads local files fine**. Only *remote* servers are excluded |
| 7 | Developer tooling | Chrome owns it: Model Context Tool Inspector, WebMCP Evals, a polyfill, `webmcp-studio`, plus Latch / webmcpify / WebMCP Kit / WindTunnel already on Chrome's curated list |
| 8 | Security auditor ("Lighthouse for agent-readiness") | Chrome ships a **Lighthouse "Agentic Browsing"** audit category; `munzzyy/webmcp-lint` was pushed the day before; `audit.wordlift.io` is the concept *and* the theme-fit mitigation, already on Chrome's own awesome list; ~40 audit-lane repos since Aug 1 |
| 9 | Read-side scope control | Most crowded lane in the hackathon. `sabahattink/sealed` ships the thesis verbatim. Also philosophically leaky, narrowing removes a capability but removes nothing from the agent's context |

## Claims that were falsified along the way

These were asserted with confidence and turned out to be wrong. Do not resurrect them.

- **"A backend MCP server structurally cannot revoke capabilities."** False. MCP spec, Tools:
  *"This set MAY be empty and MAY change over time… The set MAY vary by the authorization
  presented on the request, for example, returning only the tools the caller's granted scopes
  permit."*
- **"Cloudflare documents promise-holding as canonical HITL."** False. Cloudflare's `needsApproval`
  pauses **in the harness, before `execute` runs**, architecturally the opposite.
- **"Bank narration is a usable prompt-injection vector."** Measured on the real statements: the
  attacker-writable portion is ~6-32 characters. "IGNORE ALL PREVIOUS INSTRUCTIONS" is 32 alone.
- **"Live docs disagree about the namespace."** The spec has exactly one occurrence of `navigator`;
  the extension is `partial interface Document`.
- **Issue #256 is a "known reliability problem."** It is one non-maintainer's unreplicated n=5
  research note. Cite it as that or not at all.

## What survived, and is load-bearing

- **Finance is genuine whitespace.** Zero finance apps across ~40 first-party and sponsor demos
  (Chrome Labs' 15 verified by directory listing); three independent GitHub searches for WebMCP +
  bank/finance/money/budget/statement returned nothing.
- **Real data is the moat.** Every competitor read directly, `sealed`, `staged-webmcp`,
  `clawroom`, `dealpilot`, runs on synthetic data and none produces an artifact the user keeps.
  They cannot retrofit real bank statements in two days.
- **The data, verified by parsing:** HDFC 154pp / 1,630 rows / **100% reference-column coverage**;
  Kotak 6pp / 101; RBL 7pp / 150. **31 duplicate-charge candidates.** Only 10 fixed-amount
  recurring merchants in HDFC and **zero** in Kotak and RBL, so subscription price hikes do not
  exist in this data and must never be scripted.

## Spec facts that constrain the build

Verified in `index.bs` (79,561 bytes) unless noted.

- `toolchange` fires at **Documents**, not the agent (:337). Observation timing is
  *"implementation-defined"* (:1402). **Never depend on the agent noticing anything promptly.**
- Calling a removed tool rejects with **`UnknownError`**, revocation is provable deterministically
  from the page.
- `registerTool` mutates the tool map **synchronously**; `InvalidStateError` on a duplicate name
  only bites if you `await` between abort and re-register.
- Aborting a registration's signal **rejects that registration's promise**, `.catch()` every call.
- Unregistering does **not** cancel an in-flight `execute`.
- `ToolAnnotations` is only `readOnlyHint` and `untrustedContentHint`, both inert booleans.
- No timeout language anywhere (1 occurrence of "timeout").
- `ModelContext` is `[SecureContext]` and the `tools` permissions-policy feature defaults to
  `'self'`, so **never iframe the app**.
- Revocation is **per-Document**: two tabs are two tool maps.
- pdf.js decrypts password-protected PDFs client-side (Standard handler R2-R6). Certificate
  handlers are unsupported.
- `[UNVERIFIED]` Chrome may only preserve in-flight executions across unregistration from Chrome
  153. Confirm on the build used for the demo.
