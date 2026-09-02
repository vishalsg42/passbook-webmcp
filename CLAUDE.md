# Passbook

**It reads every row of your statement and finds the few worth a second look.**

An agent audits your real bank statements, finds charges you paid twice, and drafts the dispute
letters with you. You edit, accept, reject. The page exports a dispute pack, a document neither
you nor the agent produces alone.

Submission for The WebMCP Challenge (Devpost / OpenAI).

## Hard constraints

- **Deadline: 2026-09-03, 13:00 PT.** No late entries.
- **Post-deadline freeze:** once the deadline passes, do not touch the Devpost entry, the repo, or
  the live site. The rules require the project to stay live, public and working **until judging
  ends on 2026-09-21, 5:00 PM PT**, and to "function as depicted in the video and/or expressed in
  the text description". No commits, no deploys, no re-recording, and do not take the site
  offline. To keep building, fork and work in the copy.
- Public repo, MIT licence detectable in the About section.
- Deliverables: live URL, public repo, text description, YouTube video **under 3 minutes with audio**.

## Read first

`docs/DECISIONS.md`, ten concepts tested, nine killed on verified evidence, plus the claims that
were falsified along the way and the spec facts that constrain the build. **Read it before
proposing a pivot.**

## Working agreements

**Do not assume or invent anything.** Parsers are built against the real PDFs, never guessed.
WebMCP API claims are verified against `index.bs` or Chrome's docs before being relied on.

**No stubs.** No placeholder implementations, no `TODO: implement`, no fake data path dressed as a
real one. If something can't be finished, cut it from scope rather than shipping a shell. Seeded
demo data is real seeded data, clearly labelled, that is not a stub.

**Every tool has a human UI equivalent.** If the agent can do it, a person can do it by clicking.
This is the test of whether Passbook is a product rather than a tool demo.

## Stack

React + Vite + TypeScript · `pdf.js` (client-side only) · `localStorage`, versioned key · Netlify.
Currency INR; **all money as integer paise, never floats.** State must survive reload.

## UI/UX

Build with the `ui-ux-pro-max` or `impeccable` skill, invoke it *before* writing UI. Target a
fintech app a non-technical person can use: calm, legible, trust-building. Motion supports
comprehension and is never decorative.

## Claims, these affect judging

**Say:** the agent drafts into a document the human commits; no credential ever reaches the agent;
findings are evidence-backed and reversal-checked; every tool result the page produced is logged
with the exact field set returned.

**Never say:**
- "A backend MCP server structurally cannot do this", false, the MCP spec permits scope-varying
  tool lists.
- "Cloudflare documents promise-holding as canonical HITL", false, `needsApproval` pauses in the
  harness before `execute`.
- "Prompt-injection proof", Chrome has publicly declined that claim.
- "Your data never leaves the browser", tool results reach the model. The honest claim is **data
  minimisation**.
- "Every field the agent ever saw is logged", observations bypass `execute` entirely.

**Headline is the money found, never the mechanism.** Approval-gating is the most documented idea
in this ecosystem; leading with it caps the submission at mid-field.

## Commands

```bash
npm install
npm run dev        # dev server (sets Origin-Agent-Cluster: ?1)
npm run build
npm run preview
npm run typecheck
npm test
```

## Testing WebMCP

- **ChatGPT desktop app** → in-app browser. Supported by default, no token needed.
- **Chrome 149+** → enable `chrome://flags/#enable-webmcp-testing`, restart.
- Dev loop: `document.modelContext.executeTool(...)` from the console, or the in-page invoke button.
- The app feature-detects `document.modelContext ?? navigator.modelContext` and degrades to full
  manual use behind a capability banner.

## Day-one gate (status: PASSED)

Verified on Chrome 151: `document.modelContext` present, `window.originAgentCluster` true, all
tools discoverable through `getTools()`, and two consecutive `executeTool` invocations succeeded.

Two API facts that cost time and are worth keeping:
- `executeTool` takes its arguments as a **JSON string**. Passing an object rejects with
  `UnknownError: Failed to parse input arguments`.
- `executeTool` also **resolves to a JSON string**, not an object. The tool result is reached by
  parsing twice: `JSON.parse(JSON.parse(raw).content[0].text)`. `registry.invoke` returns
  `Promise<string>` for this reason. Verified on the deployed origin, Chrome 151.
- The tool passed to `executeTool` must be the object `getTools()` returned; it carries a required
  `origin` member, and a hand-built literal throws a `TypeError` before execution.

## Privacy

The statements in `~/Downloads/` are the owner's real financial records. Parsers are calibrated
against them locally. Never paste statement contents into an external service, never commit them,
and keep account numbers and balances out of logs and commits. `.gitignore` excludes `*.pdf` and
`fixtures/statements/`. PDF passwords are never logged or persisted.
