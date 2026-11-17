# #231: accepted COM through a public geometry candidate

Parent `4f70315482cfbbade83f2d85d8f503322cc2e6b2`. **Test/evidence only; first actual01 PASS.** No product change or new native mass calculation path. This extends the [initial session marker qualification](../pinned-mass-session-2026-11-17/README.md), not whole-issue completion.

## Observed public flow

The initial synthetic file is a single 10×10×10 mm cube, explicit body `b1`/feature `n1`, with Width parameter and aluminium density2.7 g/cm³. Public body selection and Pin create an accepted COM. The existing Parameters panel then submits invalid Width0, followed by exactly one valid Width20 submission.

| State | Independent literal expectation | Actual |
| --- | --- | --- |
| Initial accepted Width10 | volume1000 mm³, mass2.7 g, centroid[5,5,5] mm | PASS, native closed-form provenance, no pending mass reference |
| Width0 candidate | no accepted change | Real Worker evaluate request4/revision4 fails PARAMETER at n0; rectangle min must be below max |
| Failed candidate | original Doc/selection/dirty/Undo state and COM retained | Exact source/UI-state equality PASS |
| Accepted Width20 | volume2000 mm³, mass5.4 g, centroid[10,5,5] mm | PASS; original nodes/configuration definitions preserved |
| Undo/Redo | restore Width10 then Width20 and corresponding COM | PASS |

The refusal is an **actual Worker evaluation PARAMETER/n0 refusal**. It may occur in Model validation before kernel execution; candidate kernel execution is not asserted. The accepted bodies’ closed-form mass provenance is separate evidence. The historical driver assertion diagnostic says “real native geometry refusal observed”; its tested predicate is only an original Worker result with `ok:false`, and that diagnostic must not be read as kernel-execution proof.

Mass/centroid absolute tolerance is1e-9; volume tolerance1e-8. Literal arithmetic is box volume and density conversion, not a second native evaluator. Exact initial/accepted documents are provided as `initial.bcad` and `accepted.bcad`.

## Natural pending observation, not artificial delivery

The Worker subclass passively records original evaluate request/reply metadata and animation-frame snapshots. It does **not** modify messages, delay callbacks, synthesize mass patches or alter model state. Request4's original failure is recorded, and the single valid request5 succeeds.

**Two naturally occurring animation frames** were observed while request4 was outstanding. Both retained accepted Width10, fresh=true and the unchanged [5,5,5] marker. A before-original-reply sample and subsequent frames also retain that accepted marker. Old-accepted frames during the valid candidate never show the proposed Width20 COM. These are bounded observed samples, **not proof of every event interleaving or a forced-delay/late-mass race**. No absent pending interval is silently counted as PASS.

## Artifacts and visual scope

- [Refused candidate, accepted model retained](02-invalid-candidate-accepted-retained.png): Parameters not changed, Width10, accepted COM and native mass readouts.
- [New accepted dimension and COM](03-new-accepted-width20.png): mass5.4g, X≈10mm and COM marker. The enlarged body extends outside the right/bottom viewport; this is **not** full-shape framing/pixel geometry qualification.
- `receipt.json`: curated observations including every captured request/reply/frame, original receipt/capsule SHA-256 and cleanup.
- `logs.txt`: final command output.

The child and parent directly inspected both images; fixture information is synthetic and contains no personal information. Raw floating-point display is unchanged and not a new formatting guarantee.

## Validation and boundaries

Actual directory `/tmp/cad-com-candidate-01`: first run PASS; no earlier failure or discarded fixture. Source530 unchanged before/after/after cleanup, page/console errors and watched changes empty; context/browser/server cleanup complete. Source freeze released after completion.

Syntax and driver-targeted ESLint PASS, `git diff --check` PASS. No product source changed, so production type/build or existing native suites were not repeated. This run qualifies a single-member pin, real parameter geometry failure and accepted dimension update with Undo/Redo. It does **not** qualify delayed/late mass delivery, worker/project reset, missing-member recovery, arbitrary topology, preview-mode transitions, exports or all pending races. Existing #126 WIP and HOLDs remain untouched; #231 overall closure is separate.

## Reproduction

From `apps/cad-studio`, Node22, after all source writers stop:

```sh
node --check test/pinned-mass-candidate-browser.mjs
pnpm exec eslint test/pinned-mass-candidate-browser.mjs
export PW_DIR="$HOME/.cache/barocss-playwright"
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export PINNED_MASS_CANDIDATE_FROZEN=1
G="$HOME/.claude/local-mods/barocss-lanes-guard/bin/gate.sh"
"$G" acquire heavy 120 cad-com-candidate01 || exit $?
trap '"$G" release heavy cad-com-candidate01' EXIT
node test/pinned-mass-candidate-browser.mjs /tmp/cad-com-candidate-01
```

Use a new directory for later reproductions. Existing `createFlow` hashes all Studio TS/TSX/CSS plus driver/helper/config before the run, after the run and after cleanup; it also watches source changes. No new debug hook or external package is required.
