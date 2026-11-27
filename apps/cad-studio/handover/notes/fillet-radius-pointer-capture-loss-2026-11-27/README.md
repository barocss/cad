# D2059 — Discard an interrupted Fillet radius drag

P1 [row 20](../../roadmap-rows/20.md) · FEATURE · [#214](https://github.com/barocss/cad/issues/214). Product base `98a4cb4f111a22a3ea2a98e4befb1ada5656d22f`. Use the [D2058 four-upper-rim Box](../four-top-history-fillet-radius-2026-11-27/README.md) in desktop Chrome/WebGPU.

- **FAIL, prior actual desktop.** Start an end-on R1 → R2 drag, hold the button while R2 previews, and release the canvas's actual capture. The subsequent real move delivers a trusted `lostpointercapture` before button-up. Both New Fillet and the History edit still show R2 with Apply enabled after release. The accepted model is unchanged.
- **PASS, actual desktop.** New Fillet restores its R1 draft and stays open. Idle History closes the temporary radius command and restores its saved R1 feature. The older release leaves selection, dirty state, accepted document and history unchanged. A previously available Redo remains available. Native Save after cancellation writes the accepted R1 file. A new physical drag previews and applies R2. Undo, Redo, typed R2 and fresh browser Open give the same strict native solid with 10 faces, 24 edges, 16 vertices and 736.7315570194866 mm³.
- **PASS, ownership.** The pointer retires only its own Fillet radius draft and queued preview/apply. The existing radius limit may refine that draft, which stays owned by the gesture. A later typed value or replacement command retains ownership of its own draft. The pointer conversion, selection and accepted geometry use the existing paths.
- **PASS, affected checks.** Studio 84 focused checks, pinned TypeScript 5.9.2, scoped ESLint, browser syntax, diff check and the Studio production build pass. The Fillet draft cancellation lives in a separate viewport module.
- **NOT_RUN.** Full local suites, mobile, a separately triggered `pointercancel`, comparative pointer-to-feedback timing, and the remaining original #214 camera cases. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

```sh
D2059_SOURCE_FROZEN=1 node apps/cad-studio/test/box-top-fillet-history-browser.mjs "$OUT/baseline-both" --baseline --capture-loss
D2059_SOURCE_FROZEN=1 node apps/cad-studio/test/box-top-fillet-history-browser.mjs "$OUT/final" --capture-loss
pnpm --dir apps/cad-studio test fillet-scalar-draft history-fillet-radius-receipt scalar-handle-drag command-drag-wall fillet-history-identity handle-value-box gizmo
node "$TSC_592" --noEmit -p apps/cad-studio/tsconfig.json
pnpm --dir apps/cad-studio build
git diff --check
```

The previous capture run used the same browser gesture before the positive Redo control was added. Desktop receipt SHA-256 is `c5b45b7d4de121f8fc3a8211797d141737e6c64ff4886836b4d2ad004cff7a9d` for baseline and `f1c0224a7cf58486c3fccf8b201de1b36a36e9d4376108b2d1645570823b95a3` for the fixed flow. The cancelled R1 file SHA-256 is `f8f9e41b143a5174d638515a42f416d0b0c07e8c79acbb6f312dae2818c0d7fa`.
