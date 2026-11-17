# Direct Crossings: blank At is not the previous plane

Parent: `b58358ad1`. Bounded #29 input/query fix. Model geometry, refitting, tolerances, shared NumberField and protected CurveTools At-t/Split are unchanged.

## Observed gap and fix

Actual baseline public X7 Find produced `[7,-7,0]`. Clearing **Crossings At** left that answer visible and Find enabled; clicking Find again reused 7 despite the visible blank. The complete accepted document and selection remained unchanged.

Crossings now owns raw At text and uses existing finite parsing. Blank/nonfinite input immediately retires its answer, exposes invalid state, disables Find and is also rejected by the handler. Valid raw input is independent of geometry ownership; immutable source/selection changes still discard results without reviving them on Undo. No clamping or producer algorithm changes were added.

Product: `src/ui/DirectPanel.tsx` Crossings only. Focused: `test/direct-crossings-state.test.ts`. Actual driver: `test/direct-crossings-input-browser.mjs`.

## Actual acceptance

Both first runs PASS; baseline PASS denotes successful reproduction, not defect-free behavior.

- Before `/tmp/cad-crossings-input-before-01`: blank At, active Find and old crossing row observed, including a repeated Find using hidden 7.
- After `/tmp/cad-crossings-input-after-01`: blank At removes the Crossing row and disables Find. Explicit 8 enables a new query yielding exactly `[8,-7,0]`. Query operations leave the accepted document and selection unchanged.
- Public Move changes the source; its old Crossing result disappears. Undo restores the exact initial document without resurrecting a result. Only explicit Find computes the current answer again.

Independent literal basis: the authored degree1 line joins `[0,-7,0]` to `[14,-7,0]`, hence `P(t)=[14t,-7,0]`. X7 gives `t=1/2`; X8 gives `t=4/7` and `[8,-7,0]`. The UI shows rounded parameter `0.57143`; this is not an exact decimal representation of 4/7. The driver asserts the displayed point against the independent literal coordinates. The source was also independently read; no second native evaluator or new geometry certification is claimed.

## Screenshots and artifacts

- [Before blank At with stale crossing](before-01-blank-at.png).
- [After blank At, no crossing row and disabled Find](after-01-blank-at.png).
- [After explicit 8](after-02-explicit-eight.png).

Screenshots were directly and independently inspected: synthetic fixture, no personal information. Captions refer only to the **Crossings** section. The separate CurveTools **At t / Point** row still correctly shows `[7,-7,0]` and is not stale Crossings output.

[Query source](query-source.bcad), before/after curated receipts and [sanitized logs with original SHA256](logs.txt) accompany this note. Both runs froze 533 source files with no changes, errors or console errors. Context/browser/server cleanup completed; heavy gates and source freeze were released before note writing.

## Checks and reproduction

Focused **6/6 PASS** (2 new raw-input cases + 4 existing source/currentness cases), Studio typecheck and scoped lint PASS. Driver syntax/lint PASS. Sequential Studio production build PASS, Vite **8.31s**. No failed browser retries.

From `apps/cad-studio`, Node22:

```sh
node scripts/test.mjs direct-crossings-state
pnpm exec tsc --noEmit
pnpm exec eslint src/ui/DirectPanel.tsx test/direct-crossings-state.test.ts
node --check test/direct-crossings-input-browser.mjs
pnpm exec eslint test/direct-crossings-input-browser.mjs
# Freeze all source writers and acquire the shared heavy lane first.
DIRECT_CROSSINGS_INPUT_FROZEN=1 \
PW_DIR="$HOME/.cache/barocss-playwright" \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node test/direct-crossings-input-browser.mjs /tmp/cad-crossings-input-after-01
pnpm run build
```

The baseline used `--baseline` against the parent product. `createFlow` hashes the dependency capsule and compares it through cleanup. No source/driver edits were made after actual execution.

## Limits

Actual invalid input coverage is blank input. Nonfinite inputs and direct guarded-handler invocation are focused/component harness evidence, not browser executions. Those tests use actual curve queries with controlled React scheduling, not full React event integration. Actual scope is one degree1 straight curve, X-plane querying and Move/Undo invalidation. Save/fresh Open, other curve families and new native numerical accuracy were not rerun. #29 remains broader than this bounded fix; WIP/HOLD preserved.
