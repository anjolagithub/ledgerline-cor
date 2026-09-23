# LedgerLine Core — Frontend Design Specification

Status: implementation-ready specification, produced from the Phase 8
frontend audit. Most of the P0/P1 items below (`PolicyEquation`,
`PolicyVerdict`, `TransactionStatus`, the Activity view and
`LifecycleBadge`) have since been implemented in
`frontend/components/` — this document is kept as the design record
those components were built against, not as a "not started yet"
status. Sections not yet implemented (e.g. `/admin`'s lifecycle-
dropdown filtering and transaction feedback, the accessibility pass,
responsive testing below desktop) are called out inline where they
remain open. Grounded in the actual current codebase (contracts,
existing frontend scaffold) at the time it was written — nothing here
invents backend data, events, or contract behavior that doesn't
already exist.

---

## 1. LedgerLine Visual Language

LedgerLine communicates through **derivation chains, not fact grids**.
Every screen's organizing question is "what produced this number, and
what does it in turn produce?" rather than "what are the interesting
facts about this asset?" Concretely this means: numbers that are
computed from other numbers are shown adjacent to and visually
subordinate to their inputs (see Section 6's equation treatment), color
is reserved exclusively for lifecycle/decision state and never used
decoratively, and borders separate *sections* of the page, not every
individual fact.

This is not "dark mode + monospace." A financial risk terminal and a
generic crypto dashboard can share both of those traits; what
distinguishes LedgerLine is that a viewer can trace *why* a number is
what it is without leaving the screen.

---

## 2. Typography Specification

**Font family**: a single system/variable sans for UI text (e.g. Inter
or the OS default stack `-apple-system, "Segoe UI", sans-serif` — no
new font file needed, avoids a webfont-loading flash). A monospace
family (`ui-monospace, "SF Mono", "Roboto Mono", monospace`) for
anything numeric-financial, any address/hash, and any machine-readable
identifier (asset ID, reason code, tx hash).

**Four-size scale, nothing outside it:**

| Role | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| Display | 32px / 2rem | 600 | normal | The single most important number on a screen (effective capacity, the verdict) |
| Heading | 18px / 1.125rem | 600 | normal | Section titles ("Position", "Policy Evaluation") |
| Body | 14px / 0.875rem | 400 | normal | Labels, form text, trace lines, prose |
| Micro | 11px / 0.6875rem | 500 | 0.05em, uppercase | Metadata labels above a value ("POSITION VALUE", "COLLATERAL FACTOR") |

**Numeric treatment**: every financial figure uses the monospace family
with `font-variant-numeric: tabular-nums` so digits align in a column
when values update live. Never mix proportional and tabular digits in
the same figure.

**Line height**: 1.5 for body/micro, 1.2 for display/heading (tighter
leading reads as more deliberate for large numerals).

---

## 3. Color Specification

Extending the palette already established in `app/globals.css` (kept,
not replaced) with explicit semantic roles and the one addition needed
(`REVIEW`, present in the `Decision` enum but currently undefined
visually):

| Role | Token | Value | Use |
|---|---|---|---|
| Page background | `surface-0` | `--color-terminal-bg` `#0a0e14` | Body background only |
| Primary surface | `surface-1` | `--color-terminal-surface` `#10141c` | Major section backgrounds |
| Secondary surface | `surface-2` | derive as `#151b26` (new) | Nested content *only* where truly needed — e.g. inside the equation block. Used sparingly; most content should not need a third surface level at all |
| Primary text | `text-primary` | `--color-terminal-text` `#e2e8f0` | Figures, headings |
| Secondary text | `text-secondary` | new, `#a3b0c2` | Labels that aren't micro-metadata |
| Muted text | `text-muted` | `--color-terminal-muted` `#7b8794` | Micro labels, disabled state |
| Border | `border` | `--color-terminal-border` `#1e2530` | The only border weight in the system |
| Accent | `accent` | `--color-terminal-accent` `#3b82f6` | Links, focus rings, primary button fill — never decision state |
| ALLOW | `decision-allow` | `#34d399` (existing) | |
| LIMIT | `decision-limit` | `#fbbf24` (existing) | |
| REVIEW | `decision-review` | new, `#a78bfa` (violet) | Distinct from both success and danger — signals "pending human judgment," not yet wired to any MVP trigger but must render correctly if the enum value is ever returned |
| BLOCK | `decision-block` | `#f87171` (existing) | |

Decision colors are used in exactly two places: the lifecycle badge dot,
and the policy verdict. Nowhere else in the UI — not on buttons, not as
accents, not as chart colors (there are no charts).

---

## 4. Spacing & Layout Specification

Fixed scale: **4 / 8 / 12 / 16 / 24 / 32 / 48px**, no arbitrary values
anywhere in the codebase (this is a lint-able rule once Tailwind
spacing is constrained to these tokens).

- 4px — icon-to-label gaps, tightest internal padding
- 8px — form control internal padding, gaps between closely-related items (a value and its unit)
- 12px — gaps between list items (decision trace lines)
- 16px — standard card/section internal padding
- 24px — gaps between distinct sections on a page
- 32px — page-level vertical rhythm between major blocks
- 48px — top-of-page and bottom-of-page margins only

**Layout**: max content width 960px, centered, 24px gutters on
desktop/laptop, 16px on tablet, 12px on mobile. Single-column below
768px — the two-column deposit/borrow form layout collapses to stacked,
in that order (deposit above borrow, since deposit is the logical
prerequisite).

**Density**: financial infrastructure reads as *precise*, not *sparse*
— avoid the generic-SaaS pattern of large empty margins around small
amounts of content. Section spacing (24-32px) separates concerns;
internal spacing (8-16px) stays tight.

---

## 5. Overview Screen Specification (`/`)

Top to bottom:

**1. Header bar** — purpose: identity + wallet state. Content: "LedgerLine
Core" wordmark (heading size, no logo mark needed), network label
(micro, muted), connect button (right-aligned). No visual hierarchy
competition with content below — this is chrome, kept small.
Interaction: connect/disconnect. Loading: connect button shows
"Connecting..." Error: wallet rejection shows inline micro-text below
the button, not a modal. Empty: disconnected state shows "Connect" —
no separate empty state needed.

**2. Asset identity line** — purpose: establish what's being looked at.
Content: "AAPL / Stock Token", asset ID (monospace, muted), lifecycle
badge (right-aligned). Visual hierarchy: heading-size asset name,
everything else micro/muted. Loading: skeleton line at same height.
Error: if `getAssetState` reverts (uninitialized asset), replace the
whole section with an explicit message — "Asset not yet initialized" —
not silent dashes.

**3. The equation block** (replaces the 3-card grid entirely) — purpose:
make Position Value × Collateral Factor × Risk Adjustment = Effective
Capacity visible as one relationship, not three peers. Layout:

```
POSITION VALUE                                    $200,000
  ×  COLLATERAL FACTOR                                 70%
  ×  RISK ADJUSTMENT                                    80%
  ─────────────────────────────────────────────────────────
  EFFECTIVE CAPACITY                                $112,000
```

Visual hierarchy: Position Value and Effective Capacity at Display
size; the two multiplier lines at Body size, indented, muted, with the
`×` prefix; a single rule (border-weight line, not a card edge) above
the result. This is `surface-2`, the one place that secondary surface
is used, to visually set the whole equation apart as a computed block.
Interaction: none (read-only). Loading: all four values skeleton
simultaneously (they're one unit, not independent). Error: if position
raw balance is zero (no deposit yet), Position Value legitimately reads
"$0" — not an error state, a real empty position. Empty: same as above.

**4. Financial Actions** — Deposit and Borrow forms, stacked on mobile,
side-by-side on desktop/laptop as currently built, but each button
routes through the new Transaction State system (Section 8) instead of
going silent after click.

**5. Section divider**, then the Policy Evaluation block appears here
(not conditionally hidden) — see Section 6.

No footer diagram strip — the equation block in Section 3 already
communicates Position→Risk→Capacity; a separate five-word arrow strip
was redundant with it and explained nothing on its own (audit finding
#4). Removed, not replaced.

---

## 6. Policy Evaluation Specification

This is the component every other recommendation points back to.
Always visible — not conditional on a nonzero borrow amount typed in.
Default state (empty amount) shows the equation from Section 5 with no
request line; typing an amount adds the request line live.

**Exact layout, empty state:**

```
POLICY EVALUATION

$200,000 Position Value
  × 70%  Collateral Factor
  × 80%  Risk Adjustment
  ───────────────────────
  $112,000 Effective Capacity

Enter an amount to evaluate a borrow request.
```

**Exact layout, $100,000 requested (ALLOW):**

```
POLICY EVALUATION

$200,000 Position Value
  × 70%  Collateral Factor
  × 80%  Risk Adjustment
  ───────────────────────
  $112,000 Effective Capacity

Requested            $100,000 BORROW
Effective Capacity   $112,000
                     ───────────────
                        ALLOW
```

**Exact layout, $120,000 requested (LIMIT):**

```
POLICY EVALUATION

$200,000 Position Value
  × 70%  Collateral Factor
  × 80%  Risk Adjustment
  ───────────────────────
  $112,000 Effective Capacity

Requested            $120,000 BORROW
Effective Capacity   $112,000
                     ───────────────
                        LIMIT
              Maximum permitted $112,000
```

The verdict word (ALLOW/LIMIT/REVIEW/BLOCK) renders at Display size in
its decision color — this is the single largest, most colorful thing
on the entire page, deliberately, since it's the product's actual
output. "Maximum permitted" appears only for LIMIT and BLOCK (BLOCK
always shows $0). Nothing below the verdict duplicates numbers already
shown above it — this is why the decision trace (Section 7) covers only
non-numeric gates.

A one-line statement below the verdict, in micro/muted text, always
present: *"LedgerLineLendingAdapter enforces this decision onchain."* —
this is the one-sentence fulfillment of requirement 8 ("the consuming
protocol enforces the result") without turning it into its own section.

---

## 7. Decision Trace Specification

Covers only what the equation doesn't already show — non-numeric gates:

```
✓ Lifecycle: ACTIVE
✓ Price feed valid
✓ Position exists
```

or, when lifecycle blocks:

```
⚠ Lifecycle: CORPORATE_ACTION — all actions blocked
```

Three lines only when active, one line when blocked (there's no point
evaluating the rest once lifecycle already fails — matches the actual
`canExecute` short-circuit logic in `LedgerLinePolicy.sol`, which
returns BLOCK immediately on non-ACTIVE lifecycle without computing
capacity at all). Rendered as body-size text, not micro — this is the
one piece of prose-like content on the page, and needs to read as a
sentence, not a label.

REVIEW has no trigger in the current contracts (locked decision from
Phase 3) — if it's ever returned, the trace and verdict render
identically to the other three decisions, just in the violet
`decision-review` color, with no special-cased UI logic needed.

---

## 8. Transaction State Specification

Applies to both Deposit and Borrow buttons. States, and what the button
region shows for each:

| State | Button label | Additional UI |
|---|---|---|
| Idle | "Deposit" / "Borrow" | none |
| Preparing | "Preparing..." | button disabled |
| Wallet confirmation | "Confirm in wallet" | button disabled, spinner |
| Submitted | "Submitting..." | tx hash appears (monospace, truncated, linked to block explorer once one exists) |
| Pending | "Confirming..." | same, spinner continues |
| Confirmed | "Deposit" (reset) | brief inline success line below the form: "Deposited $X" — auto-clears after a few seconds |
| Failed (reverted) | "Deposit" (reset) | inline error line, red text, with the revert reason if decodable (e.g. `PolicyBlocked`, `ExceedsPermittedAmount` map to human sentences, not raw hex) |
| User rejected | "Deposit" (reset) | inline muted line: "Rejected in wallet" — not styled as an error, this isn't a failure of the system |
| Insufficient balance | button disabled before submit | inline line: "Insufficient balance" shown proactively, not after a failed tx |
| Wrong network | replaces the whole form | "Switch to [chain name]" button, using wagmi's `useSwitchChain` |

Implementation note (not yet built): requires wiring
`useWaitForTransactionReceipt` after every `useWriteContract` call —
currently entirely absent, which is why buttons appear to do nothing
(audit finding).

---

## 9. Operator Screen Specification (`/admin`)

- **Operator identity**: connected address + explicit "Operator Mode"
  label (already exists) — add the owner address itself displayed
  alongside, so a non-owner viewing the denied state can visually
  confirm which address they'd need.
- **Asset state controls**: existing collateral/risk bps inputs, kept.
- **Lifecycle transition controls**: existing dropdown, kept — but
  should only offer states valid from the *current* lifecycle
  (`Registry.isValidTransition`, already exposed onchain from Phase 6)
  rather than all seven unconditionally. Prevents an operator from
  submitting a doomed transaction and seeing a raw revert.
- **Position writer configuration**: not currently in the UI at all.
  `setPositionWriter` exists on the contract but has no form. Given it's
  a one-time deployment-configuration action (set once to the lending
  adapter's address, essentially never changed again), this does **not**
  need a UI control — it belongs in a deployment script (Phase 11), not
  a recurring operator action. Explicitly not adding it here.
- **Transaction feedback**: same Transaction State system as Section 8,
  applied to both operator actions.
- **Denied/non-owner state**: upgrade from one gray sentence to: the
  sentence, plus the actual owner address shown so a judge understands
  this is working-as-designed access control, not a bug.

---

## 10. Activity Screen Specification

Grounded strictly in events that exist today — no new events invented,
none requested:

| Event (existing) | Contract | Activity row |
|---|---|---|
| `Deposited(user, amount, newRawBalance)` | LendingAdapter | "Deposited $X" |
| `Borrowed(user, amount, newDebt)` | LendingAdapter | "Borrowed $X" |
| `LifecycleTransitioned(assetId, from, to)` | Registry | "Lifecycle: FROM → TO" |
| `AssetParametersUpdated(assetId, price, multiplier, collateralFactorBps, riskAdjustmentBps)` | Registry | "Risk parameters updated" |
| `AssetInitialized`, `PositionWriterUpdated` | Registry | Setup-only events; could be filtered out of the default view as noise, shown only in a "show all" toggle |

**Explicit gap, not worked around**: `canExecute` is a `view` function
and emits nothing — there is no onchain record of past policy
evaluations, only of the deposits/borrows that actually executed. If a
"decision history" view is wanted later, it would require either (a) an
event added to `canExecute`'s call sites when a real write happens
(possible — `borrow()` already knows the decision it got, could emit it
alongside `Borrowed`), or (b) an offchain log the frontend keeps itself.
Neither is built here — flagging the gap per the instruction not to
invent data.

Layout: reverse-chronological list, each row = timestamp (relative,
"2m ago"), action label, amount (monospace, tabular), tx hash
(monospace, truncated). No pagination needed at current/demo scale.

---

## 11. Component Specification

**UI primitives (none currently exist as real reusables — every
current component inlines its own Tailwind string):**

- `Button` — variants: primary (accent fill, for the main action per
  form), secondary (border only, for approve/secondary actions). States:
  idle, loading (spinner + disabled), disabled.
- `Input` — single variant, numeric and text. States: idle, focused,
  error (red border + inline message below).
- `Select` — used only in `/admin`'s lifecycle dropdown.
- `StatusBadge` — the dot+label pattern, generalized from
  `LifecycleIndicator` so it can also represent tx state pills if ever
  needed.

**LedgerLine domain components:**

- `PolicyEquation` — the Section 6 block. Props: position value,
  collateral bps, risk bps, computed capacity. Pure presentation, no
  data fetching inside it.
- `PolicyVerdict` — decision + permitted amount + the trace lines from
  Section 7. Takes the `canExecute` response as a prop; does not fetch.
- `LifecycleIndicator` — kept as-is from Phase 8, already correct.
- `TransactionStatus` — new, implements Section 8's state machine;
  wraps any write-contract action.
- `ActivityRow` — new, one event → one row, per Section 10's table.

Explicitly **not** building: a generic `Metric` component, a separate
`OracleStatus`/`NetworkStatus` component — with exactly one asset and
one chain active at a time, these would each have a single call site,
which is the premature-abstraction pattern this project's own
non-negotiable rules elsewhere reject.

---

## 12. Accessibility Specification

- **Keyboard**: every interactive element (connect, approve, deposit,
  borrow, lifecycle select, admin inputs) reachable via Tab in visual
  order; Enter/Space activates buttons.
- **Focus states**: visible focus ring using the `accent` color at 2px,
  on every focusable element — currently absent anywhere in the
  scaffold.
- **Labels**: every `<input>`/`<select>` gets a real `<label>`
  (currently the Deposit/Borrow inputs use only a placeholder, which
  fails on screen readers once the field has a value).
- **Color-independent decision communication**: the verdict is never
  color alone — it's always paired with the word (ALLOW/LIMIT/etc.),
  already true in the current design and must stay true through any
  redesign.
- **Semantic structure**: real `<main>`, `<nav>`/`<header>`,
  `<section>` elements instead of generic `<div>`s throughout — not
  currently followed.
- **Contrast**: `text-muted` (#7b8794) on `surface-0` (#0a0e14) needs a
  contrast check against WCAG AA (4.5:1) before final implementation —
  flagging as a check to run, not asserting it passes.
- **Reduced motion**: the only animation in the system should be the
  tx-pending spinner; respect `prefers-reduced-motion` by replacing it
  with a static "..." or pulsing opacity instead of a spin, if the user
  has that preference set.

---

## 13. Responsive Specification

Policy Evaluation specifically, since it's called out:

- **Desktop/laptop** (≥1024px): equation block and verdict as specified
  in Section 6, side-by-side with the Deposit form above it in the page
  flow (not side-by-side with each other).
- **Tablet** (768–1023px): same vertical structure, just narrower —
  nothing in the equation needs to reflow since it's already a vertical
  stack of labeled lines, not a horizontal card row.
- **Mobile** (<768px): identical structure; only the outer page gutter
  shrinks (24px→12px per Section 4). The equation's right-aligned
  numeric column and left-aligned label column both stay — this layout
  was designed to not require a mobile-specific rework, which is the
  payoff of not building it as a card grid in the first place.

---

## 14. LedgerLine Anti-Patterns

- **Three-equal-weight stat cards for related numbers** — inappropriate
  specifically because Position Value, Collateral Factor, and Risk
  Adjustment aren't peers; they're a chain of inputs, and equal visual
  weight actively misrepresents that relationship.
- **Card-in-card nesting** — inappropriate because it adds visual noise
  without adding information; a single `surface-2` block (used once, for
  the equation) achieves the "this is a computed unit" signal without
  stacking borders.
- **Decision colors used anywhere but the badge and the verdict** —
  inappropriate because it would dilute the one signal in the whole UI
  that's supposed to mean "this is the system's actual output."
- **A five-word pipeline diagram with no elaboration** — inappropriate
  because it names a process without explaining any step, which reads
  as decorative rather than informative; the equation block does the
  same communicative job with actual content.
- **Building a multi-asset nav shell for a single-asset demo** —
  inappropriate given actual current scope; adds navigation the product
  doesn't yet have content to fill.

---

## 15. Implementation Sequence

**P0:**
1. `PolicyEquation` + `PolicyVerdict` components, always-visible (Sections 5–7)
2. `TransactionStatus` component + wiring `useWaitForTransactionReceipt` into Deposit/Borrow/admin actions (Section 8)
3. Remove the three-card grid and footer pipeline strip

**P1:**
4. `Button`/`Input` primitives, replacing the 4+ divergent inline stylings
5. Apply the fixed type scale + spacing scale throughout
6. `ActivityRow` + Activity view, sourced from the five real existing events (Section 10)

**P2:**
7. Real icon set replacing raw Unicode glyphs in the decision trace
8. `/admin` denied-state improvement (show owner address) + lifecycle dropdown filtered to valid transitions only
9. Accessibility pass (labels, focus rings, semantic elements, contrast check)
10. Responsive testing pass below desktop width (currently untested at any width but desktop)

Stopping here per instruction. No code written against this spec yet.
