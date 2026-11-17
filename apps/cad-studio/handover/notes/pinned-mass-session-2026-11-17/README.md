# #231: bounded session centre-of-mass marker

Parent commit: `1ff0b00ddfa152297d8cd716bfcb832fcac9fc31`. This implements a narrow static, read-only ordinary base-part marker, not the whole issue. **#231 remains OPEN.** Physics/Motion, manufacturing, shared GPU, persistence schema and original WIP remain unchanged.

## Product contract

Explicitly pin one or two current qualified native solid bodies. Every member must retain exact output/key/feature/ref ownership and usable mass, centroid, inertia and material density. A missing, pending or invalid member makes the entire set unavailable, not a partial aggregate. Existing `bodyMass`/`combined` are reused. Hidden members remain included with an explanation. Selection does not redefine an existing pin.

The SVG marker is not a picking, snapping, export or document entity. It shows accepted-model mass, not candidate geometry or a balance/safety approval. Current material/provenance, assumed defaults and estimated-method limits are disclosed. COM offer/card/overlay are restricted to ordinary Model view (`previewMode === 'none'`); entering another display mode does not itself erase membership. Clear and document/session replacement retire the session pin. No document/history mutation or automatic mass computation path was added.

The event guard compares session, document, body-result snapshot, currentness, availability, material and exact selected membership rather than transient wrapper-object identity. It re-captures and qualifies the live set before pinning. Actual01 established an enabled-button no-op; a specific compiler cause was **not** established.

## Final actual04 PASS

Run: `/tmp/cad-pinned-mass-04`; final runtime log `/tmp/cad-pinned-mass-04-run.log`. Public UI only; initial native document fixture is synthetic, two disjoint 10 mm cubes with explicit stable IDs. No extra native evaluator or product-state injection.

- Native current result: both volumes approximately 1000 mm³, no pending mass reference; both member readouts say `closed-form`.
- Independent arithmetic: density 2.7 and 7.85 g/cm³ gives masses 2.7 and 7.85 g, total 10.55 g, centroid `[5765/211, 5, 5]` mm. Actual COM/mass checked with absolute tolerance `1e-9` (volume `1e-8`), not string rounding.
- Pin and Clear preserve exact document, selection, dirty indication and Undo/Redo controls.
- Escape clears selection without losing the marker. Hiding Cube B leaves its mass included and explicitly labels it hidden.
- Public material change of B to aluminium gives mass 5.4 g and X=20 mm. Geometry node JSON remains unchanged. Undo/Redo restore the corresponding accepted values.
- Clear removes the marker. Public Open of the same-key original file and New clear the pin; no stale pin reappears.
- All 529 frozen source files match after execution and after cleanup. Page errors, console errors and source changes are empty. Context, browser and server close successfully.

`receipt.json` is curated, preserves analytic/native observations, original receipt/capsule hashes and prior-attempt hashes. Full original receipts remain at the recorded temporary paths. `owned-source-sha256.json` records the eight owned product/validation files.

### Actual images

Child and parent directly inspected all three images: synthetic data, no personal information. Raw floating-point text wraps in the narrow panel; this is not a precision/formatting qualification.

1. [Two current cubes and explicit COM](01-two-cube-native-com.png): two selected bodies, marker and per-member density/provenance.
2. [Hidden member still included](02-hidden-member-included.png): B hidden, unchanged COM, explicit hidden-member notice.
3. [Accepted material update](03-accepted-material-update.png): B aluminium and COM near X=20; original body geometry is unchanged.

## Failures preserved, not relabelled

- **actual01 FAIL**: enabled Pin click did not create a pin. Product wrapper-identity over-rejection corrected; original `/tmp/cad-pinned-mass-01` retained.
- **actual02 FAIL**: corrected pin worked; harness expected literal `10.55 g` rather than actual `10.550000000000006 g`. Replaced by numeric tolerance and actual `closed-form` provenance assertions.
- **actual03 FAIL / interrupted, NOT QUALIFIED**: operator patch used the wrong relative path; shell continued with unchanged assertion. It repeated the same harness failure and was interrupted. Receipt cleanup is empty, so this is not reported as a normal cleanup pass. Subsequent process inspection found no owned driver/Vite/Playwright Chrome remaining.
- **actual04 PASS**: corrected driver syntax/lint verified before execution. Only this run qualifies the full bounded actual flow.

Original path and SHA-256 of each failure receipt, state and PNG are recorded in `receipt.json`.

## Checks

- Studio focused **4/4 PASS**: three pure all-member/identity/material/provenance tests plus one controlled real-hook test. The hook test supplies simulated React hooks and authority inputs, including fresh wrapper/retained callback acceptance and seven changed-authority callback refusals. It is not App/browser late-response proof.
- Model direct-impact **17/17 PASS**: `mass.test`, `material-look`, `native-mass-wire` filters, sequential under heavy gate.
- Studio TypeScript PASS; new helper/hook/UI/test and driver targeted lint PASS. This is **not** a claim that all App/Viewport lint was run.
- Final post-guard production build **4.34 s PASS**. Earlier pre-guard build 5.11 s is not the final build.
- `git diff --check` PASS. Logs and original log SHA-256 are in `checks.txt`.
- Initial type/harness development failures were corrected before final qualification: material `.name` typing, bundled esbuild dynamic require, then the actual failures above.


Targeted lint commands (cwd `apps/cad-studio`; all exit 0):

```sh
pnpm exec eslint src/app/pinnedMass.ts src/state/usePinnedMass.ts src/ui/PinnedMassControls.tsx test/pinned-mass.test.ts test/pinned-mass-lifecycle.test.ts
pnpm exec eslint src/state/usePinnedMass.ts test/pinned-mass-lifecycle.test.ts
pnpm exec eslint test/pinned-mass-browser.mjs
```

The first command covers the five new TypeScript helper/hook/UI/test files (`/tmp/cad-com-lint3.log`). The second is the final post-guard recheck (`/tmp/cad-com-guard-lint.log`). The third covers the actual driver, rerun after the numeric/provenance assertion correction (session25814 exit0). **App.tsx and Viewport.tsx are excluded from these lint commands**; both are covered by final Studio TypeScript and production build. No whole-project lint claim.

## Files and unqualified boundaries

Product: `src/App.tsx`, `src/viewport/Viewport.tsx`, `src/app/pinnedMass.ts`, `src/state/usePinnedMass.ts`, `src/ui/PinnedMassControls.tsx`.
Validation: `test/pinned-mass.test.ts`, `test/pinned-mass-lifecycle.test.ts`, `test/pinned-mass-browser.mjs` (all relative to `apps/cad-studio`).

**Actual NOT_RUN:** candidate-success/failure and late mass races, single-member pin, dimension edits/movement, export consumers, worker restart/project replacement, print/CNC mode transitions, pan/zoom/resize, missing/invalid member recovery and broader assembly/direct-body scope. Focused tests cover only their stated pure/helper/simulated-hook boundaries. Hidden inclusion and material changes were actual; they do not imply all ownership/race acceptance conditions are closed. No Physics/Motion, native topology, dynamics or safety qualification is claimed.

## Reproduction commands

Run sequentially under the shared heavy lane, not alongside another browser or source writer. Node 22 was used. From `apps/cad-studio`:

```sh
node scripts/test.mjs pinned-mass
pnpm exec tsc --noEmit
# Targeted lint commands and exact file scope are listed above.
pnpm exec eslint src/state/usePinnedMass.ts test/pinned-mass-lifecycle.test.ts
pnpm exec eslint test/pinned-mass-browser.mjs
pnpm exec vite build
```

From `packages/barocss-cad-model`:

```sh
node scripts/test.mjs mass.test material-look native-mass-wire
```

Actual04, from `apps/cad-studio`, after all writers stop:

```sh
export PW_DIR="$HOME/.cache/barocss-playwright"
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export PINNED_MASS_FROZEN=1
G="$HOME/.claude/local-mods/barocss-lanes-guard/bin/gate.sh"
"$G" acquire heavy 120 cad-com-actual04 || exit $?
trap '"$G" release heavy cad-com-actual04' EXIT
node test/pinned-mass-browser.mjs /tmp/cad-pinned-mass-04
```

Use a **new output directory** for any later reproduction; do not overwrite this evidence. `createFlow` builds the initial subset capsule, then freezes the driver/helper, every Studio `src` TS/TSX/CSS file and Vite config with SHA-256. It checks the initial subset against the frozen snapshot, watches source changes, compares all 529 frozen files after the actual flow and again after resource cleanup, and writes `source-*.json` plus the receipt. It is an observed immutable-source check, not an OS write lock. No inspector bundle or independent native evaluation was added in this driver.
