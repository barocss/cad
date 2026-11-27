# D2061 — Anchor a saved Fillet to its original angled rim

P1 [row 20](../../roadmap-rows/20.md) · [#214](https://github.com/barocss/cad/issues/214) · Reproduced at `c83fd385334cff12f79bdb3e6e205800bd959f3c`.

A new Constant Fillet on the first upper rim of a 12 × 8 × 8 mm rotated rectangular Extrude already follows the original straight edge. In History, the same Fillet used a grip on the finished face. In the desktop perspective view that put the grip 24.431727 CSS px from the original frame and omitted the end-on grip. The exact source edge is `n1.side0|n1.top`, with world tangent `[0.6, 0.8, 0]`.

History now checks the unplaced native source line, its two plane supports and the finished cylindrical quarter patch before using the original rim frame. The Model module verifies the exact patch and its four reciprocal trims. A Studio module verifies the source binding and computes the frame. The evaluator forwards the optional evidence and clears it on placement. The supported recipe is a terminal circular constant Fillet on the first upper rim of a positive XY rectangular Extrude with a rotated first-quadrant X axis. Other cases keep their existing edit paths.

## Verification

- **PASS, actual desktop Studio.** Real mouse selection and orthographic end-on drag create R1 from R0.5. Opening that Fillet in perspective now places the grip within 0.000041 CSS px of the independent original frame. An end-on pointer 10 CSS px to the right of its centre can drag R1 → R2. Cancel retains R1. A second drag and explicit Apply commit R2. Undo and Redo follow the same saved feature. Typed R2 gives the same document and native digest as the dragged R2. The saved file opens in a fresh Studio context with the same radius and edge identity.
- **PASS, native result.** Strict B-rep check passes with one closed, genus-zero solid. The solid volumes are 765.4247779607693 mm³ at R1 and 757.6991118430775 mm³ at R2, equal to the independent rectangular stock and removed quarter-round calculation, `768 - 12 * (1 - π/4) * r²`. The cylinder axis is parallel to the source edge. Its centre line is r mm below the cap and r mm inward of the wall.
- **PASS, feature checks.** Model 19/19 and Studio 96/96, scoped ESLint, browser-driver syntax, Model and Studio type checks, Studio production build and diff check. The actual desktop run recorded zero page or console errors and retained the same 1,253 source files through cleanup.
- **FAIL, initial Studio suite.** One existing Fillet family harness lacked the section-vertex picker reference required by the viewport hook. Add an inactive picker stub to let the existing test reach the Fillet branch. There is no viewport production change in this correction.
- **NOT_RUN.** Full local test suites, mobile, alternate desktop backends for this fixture, additional angle quadrants or arbitrary curved blends. The first mechanical CAD baseline remains 8/10 and overall CAD completion is unmeasured.

## Original #214 acceptance

| Original criterion | Evidence |
| --- | --- |
| Orthographic, perspective, projected/near/end-on, zoom and non-cardinal direction | [Actual projected, perspective and transition profiles](../perspective-fillet-radius-drag-2026-11-21/README.md) plus D2061. |
| Declared curved examples and shared grip ownership | [New circular](../circular-fillet-arc-handle-2026-11-21/README.md), [saved quarter rim](../circular-history-fillet-radius-drag-2026-11-21/README.md), [saved complete rim](../closed-circular-fillet-history-handle-2026-11-24/README.md) and [saved four straight rims](../four-top-history-fillet-radius-2026-11-27/README.md). |
| Continuous, finite, reversible input, stable release and hit target | Actual round-trip and zoom in D1475, the 10 px off-centre hit in D2061 and the transition checks in `scalar-handle-drag.test.ts`. The generic end-on zero case has its own checks in that suite and `gizmo.test.ts`. |
| New and History, typed parity, explicit Apply, Undo/Redo and native ownership | [New Fillet desktop workflow](../fillet-end-on-drag-2026-11-18/README.md) plus D2061. |
| Invalid radius, reversal, stale work, pointer cancellation, command replacement and source changes | [Actual refusal/reversal](../four-top-history-fillet-radius-2026-11-27/README.md), [trusted capture-loss flows](../fillet-radius-pointer-capture-loss-2026-11-27/README.md), [delayed original source check](../circular-history-fillet-radius-drag-2026-11-21/README.md), and focused command/source ownership cases in `fillet-family.test.ts`, `fillet-scalar-draft.test.ts` and `history-fillet-radius-receipt.test.ts`. |
| Measured before/after feedback, requests and release | [D2060's 26 actual desktop samples](../fillet-radius-desktop-timing-2026-11-27/README.md). |

The acceptance map covers the interaction on the declared native inputs. General blend support belongs to [#12](https://github.com/barocss/cad/issues/12).

```sh
# Node 22.19.0. Gate one heavy run at a time. Use the existing local Chrome and Playwright.
D2061_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/angled-rim-fillet-history-browser.mjs "$OUT/baseline" --baseline
D2061_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/angled-rim-fillet-history-browser.mjs "$OUT/final"
node --check apps/cad-studio/test/angled-rim-fillet-history-browser.mjs
pnpm --dir packages/barocss-cad-model test native-angled-top-fillet native-box-top-fillets native-fillet-pair
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag gizmo fillet-family fillet-scalar-draft command-drag-wall
# TypeScript 5.9.2
tsc --noEmit -p packages/barocss-cad-model
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

The baseline desktop receipt SHA-256 is `64d4d229157faa4ba1ae744b2e970066d59d4ddeab3ba5db9f42541fec03ce9c`. The fixed desktop receipt is `436a52c5ae08af6c5c185826b43824c32fc73683ebd13b367f869ce4529165e6`. The dragged, typed and reopened R2 native digest is `65acd211791e655cf16fd28251b49665582f18a87835e0c1ddab32610a38f5fc`.
