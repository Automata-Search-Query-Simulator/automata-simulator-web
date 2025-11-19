# Automata Pattern Search Visualizer – Product Spec

## 1. Overview
- Build a browser-based visualizer that wraps the existing Flask simulator running at `http://127.0.0.1:5000/simulate`.
- Backend reference codebase: `/Users/raldhelbiro/Documents/Projects/Flask/automata-simulator-api/BACKEND`; align request/response fields with that implementation.
- Target audience: bioinformatics students and researchers who want to explore DNA/RNA pattern searches using classical automata models.
- Design goals: single-page experience, minimalistic yet elegant visuals using shadcn/ui, responsive from 360 px phones to 1440 px desktops, ready for future animated automaton diagrams returned by the backend.

## 2. Supported Modes
| Mode label | Backend `mode` value | Description | Unique UI elements |
| --- | --- | --- | --- |
| Exact NFA | `nfa` | Non-deterministic automaton executing regex on DNA motifs. | Regex helper tooltip, epsilon-transition note. |
| Exact DFA | `dfa` | Deterministic automaton for fast scans; shows state minimization summary. | Determinism badge, throughput stats placeholder. |
| Approximate EFA | `efa` | Extended finite automaton that tolerates mismatches up to a user-defined budget. | Mismatch slider, mismatch heatmap in results table. |
| Dot-Bracket PDA | `pda` | Pushdown automaton validating RNA structures using dot-bracket grammar. | Dot-bracket toggle, stack-depth indicator, pairing legend. |

Mode selection occurs first via shadcn `ToggleGroup`, updates contextual helper copy, and immediately toggles mode-specific form controls.

## 3. Endpoint Contract (`GET /simulate`)
All modes rely on a single endpoint. Requests must include the following query params:

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `input_path` | string | Conditional | Absolute path to a FASTA/JSON file accessible to the backend. Required when sequences textarea empty. |
| `sequences` | stringified array | Conditional | JSON array (e.g., `["ACGTACGT"]`). Required when no file path supplied. UI enforces uppercase nucleotides except PDA mode where braces/dots allowed. |
| `mode` | enum | Yes | Values `nfa`, `dfa`, `efa`, `pda`; derived from primary selector. |
| `pattern` | string | Yes | Regex (NFA/DFA/EFA) or dot-bracket pattern (PDA). Provide syntax hints and validation. |
| `mismatch_budget` | integer | EFA only | Range 0–5. Slider disabled outside EFA; send 0 by default to keep backend schema stable. |
| `allow_dot_bracket` | boolean | PDA optional | Toggle that tells backend to treat pattern as dot-bracket. Locked to `false` for other modes to avoid confusion. |

HTTP client: `axios` instance with 5 s timeout, JSON parsing, and cancellation tokens so users can stop long-running jobs. Include default headers defined in the Flask backend repo.

## 4. User Stories
1. *As a student,* I can choose an automaton mode, paste a pattern and DNA sequence, and immediately see whether the sequence is accepted, so that I understand theory through interaction.
2. *As a researcher,* I can load a local FASTA file, set an approximate mismatch budget, and inspect mismatch locations returned by the backend to evaluate motif robustness.
3. *As an instructor,* I can switch to PDA mode, input dot-bracket chains, and show stack operations and future animations to explain RNA structure validation.

## 5. UX and Visual Design Requirements
- **Layout:** Two-column grid ≥1024 px (form left, results right); stack vertically on smaller screens. Keep an always-visible action bar on mobile with the `Run Simulation` button.
- **Components:** Use shadcn `Card`, `ToggleGroup`, `Input`, `Textarea`, `Slider`, `Switch`, `Tabs`, `Alert`, `Skeleton`, and `DataTable`. Add Lucide icons for mode cues. Avoid ornate gradients—focus on clean surfaces, soft shadows, readable typography.
- **Feedback:** Inline validation for every field, toast on successful run, shadcn `Alert` for HTTP failures. Provide skeleton loaders for the results panel while waiting for backend response.
- **Accessibility:** WCAG 2.1 AA, keyboard focus rings, aria-labels for controls, `aria-live` status for request lifecycle updates.
- **Responsiveness:** Ensure controls wrap gracefully; long file paths truncated with CSS `text-overflow`; sequence textarea becomes expandable with virtualized height for large inputs.

## 6. Form & Validation Logic
Use React Hook Form + Zod schema:
```ts
mode: z.enum(["nfa","dfa","efa","pda"]),
sequences: z.string().optional(),
inputPath: z.string().optional(),
pattern: z.string().min(1, "Pattern required"),
mismatchBudget: z.number().min(0).max(5),
allowDotBracket: z.boolean()
```
Validation rules:
- Require at least one of `sequences` or `inputPath`.
- Force uppercase DNA characters and IUPAC ambiguity codes in regex modes; PDA mode allows parentheses, dots, and brackets.
- Disable mismatch slider unless `mode === "efa"`; disable dot-bracket switch unless `mode === "pda"`.

## 7. Simulation Flow
1. **Mode Selection** → sets defaults (`mismatch_budget=0`, `allow_dot_bracket=false`).
2. **Input Preparation** → handle textarea parsing into array, file picker capturing absolute path, show preview of sequences count.
3. **Parameter Review** → summary card listing final payload; highlight missing required fields.
4. **Submission** → `Run Simulation` button triggers TanStack Query mutation, shows loading indicator and allows cancellation.
5. **Results**
   - Summary card: mode, runtime, sequence count, matches, mismatch totals, stack max depth.
   - Sequence table: acceptance status, mismatch positions (chips), PDA stack trace snippet.
   - Trace viewer: chronological list of backend steps. Reserve a transparent canvas with caption “Animated state diagram coming soon” where future animation component will mount.
6. **History** → persist last five successful requests in local storage so users can recall previous simulations.

## 8. Error Handling & Edge Cases
- Surface backend validation errors verbatim but add human-readable guidance (e.g., “Invalid regex near `[`; check unescaped characters”).
- Detect offline backend (network/CORS) and show actionable message (“Ensure Flask server at 127.0.0.1:5000 is running”).
- Large payload guard: warn users if textarea exceeds 10 k characters; encourage file mode instead.
- Handle mismatched mode/pattern combos by preventing submission (e.g., dot-bracket characters while in DFA mode).

## 9. Implementation Notes
- Tech stack: Next.js App Router + TypeScript, Tailwind, shadcn/ui, TanStack Query, Axios, Zustand (optional) for lightweight local history.
- Testing: Vitest + React Testing Library for form schema and API integration; Playwright smoke test covering mobile + desktop breakpoints.
- Analytics hooks (optional): log mode usage to help prioritize effort.

## 10. Future Enhancements
1. **Animated State Diagram** – placeholder canvas should accept JSON describing nodes, edges, and step order so the future animation module can plug in without reworking layout.
2. **Batch Runs** – allow queueing multiple patterns and streaming responses.
3. **Shareable Links** – serialize form state into query params for quick demos.
4. **Educational Overlays** – step-by-step explanations overlaying the animation for classroom use.

This spec should guide the initial UI implementation while leaving room for deeper visualization and backend-driven animation features.
