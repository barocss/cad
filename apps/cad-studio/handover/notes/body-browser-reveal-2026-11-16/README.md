# Explicit selected base-body reveal (#266, first bounded delivery)

Base: `322eee53c7b3a227d09810a89520d169e8c9dc76`. Roadmap P4 functional usability; no owner layout redesign.

## Delivered

The Browser header now offers **Show selected body in Browser**. One current base body, or faces/edges belonging to that same body, resolves to its exact evaluated body key. The action opens a collapsed Browser, focuses that body's existing name button without clicking it, and minimally scrolls only the overflowing Browser/dock panel. Ordinary selection changes do not reveal automatically. Names and row positions are not identities.

The request is owned by document/evaluation/body/selection identity, document generation, worker session, file-open intent and supported interaction state. A one-shot layout effect consumes it after rows mount; there is no delayed timer or automatic selection-following effect. Escape invalidates its ticket. Stale ownership cannot focus another document's same local key.

Pointer-down prevents input blur. An uncommitted input, active edit/command, drag, modal, pending document operation or unsupported view gives a reason instead of applying/canceling edits. Placed parts/nested paths, direct geometry, sketches, vertices and mixed/multiple body selections remain explicitly unsupported. This is a partial delivery of #266, not completion of its full instance/nested contract.

## Verification

- New focused tests: **8/8 PASS**. Exact-key identity, multi/mixed/stale/unsupported selections, empty optional profile selection, owner/ticket mismatch, Escape ticket, minimum scroll displacement, actual overflowing dock rather than non-overflowing Browser/page, hidden/disconnected rows, input/dialog refusal.
- Actual Chrome WebGPU **1024×800 and 1440×900**, fixture of 36 same-named bodies: viewport face selection does not auto-scroll; explicit action finds last exact key `b71`; repeated reveal retains its scroll position; collapsed Browser reveals after mount; keyboard Enter on the action also reveals a body selection.
- The real UI retains an uncommitted rename and its input focus, leaves an active Linear pattern command open, refuses two-body selection, and does not auto-focus the same key after opening a replacement document.
- Before/after comparisons preserve accepted Doc, dirty, Undo/Redo controls, selection, camera eye/projection sample and window scroll. This does not claim new native geometry accuracy or Save/Open format qualification.
- Final actual-browser receipt PASS, no runtime/console errors, frozen-source changes or downloads. Narrow closed-Browser reveal and wide exact-row screenshots visually reviewed.
- Studio TypeScript **PASS**, production Vite build **PASS** (4.28s), browser driver syntax and diff checks PASS. Changed production files other than App lint clean; App retains its pre-existing unused `_k` error at line 2438. The test DOM stand-ins have nine `any` warnings and no lint errors. Full repository lint/suite is not claimed clean.
- Separate Model TypeScript invocation was **blocked by checkout module resolution** (`@barocss/cad` and `@barocss/cad/api` unresolved), not used as a PASS. No Model source changed and no dependency installation was attempted.

Run from Studio, after the normal heavy-run gate, with `PW_DIR`, `CHROME`, `BODY_BROWSER_REVEAL_FROZEN=1`:

```sh
node test/body-browser-reveal-browser.mjs <artifact-directory>
node scripts/test.mjs body-browser-reveal
```

## Remaining scope

#266 stays OPEN for top-level placed parts, exact nested paths/ancestor expansion and its broader acceptance matrix. Request ownership/Escape is covered by focused tests; actual browser interruption between React mount and layout-effect consumption was not artificially injected. Native-folder, schema/kernel, manufacturing/Physics, owner redesign and other HOLDs remain unchanged. Original #126 WIP is preserved.
