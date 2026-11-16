# Rejected Fillet preview pick: existing removal recovery (#23)

## Boundary

When the current Edge Fillet has an existing named picked-edge row, the unchanged `Selection not changed` toast now points to `Edit picked edges` and its `Remove` action. The generic warning about generated/ambiguous references and the unchanged-selection/no-queued-Apply detail remain. Other Fillet types and absent/unusable rows receive only the original message.

The helper receives the current active command, not the generated hit. It cannot infer that a generated boundary is a particular selected source. Source remapping, hit admission, owner guards, accepted preview, selection, pending Apply retirement and list removal are unchanged. No Shell, manufacturing or kernel expansion.

## Baseline and verification

Actual Chrome baseline at 1024 × 900: stadium prism straight span20, endR4, height6, constant FilletR1.5. Picking one top and one bottom edge produced 2 picked/6 added. Shift-clicking the same already rounded bottom location refused without naming the existing removal list. The accepted document, two selections and R1.5 remained. Existing list removal restored 1 picked/3 added, then Apply/Undo/Redo passed. Baseline `/tmp/cad-pick-recovery-baseline01`; screenshot reviewed.

PASS: new helper plus existing Fillet-family tests 20/20 (including queued Apply retirement on a refused hit), Studio TypeScript, App/helper/test lint and build (4.28 s). Frozen-source Chrome at 1024 × 900 passed the new toast, retained source selection/radius/document, existing Remove recovery and Apply/Undo/Redo (`/tmp/cad-pick-recovery-final01`). Screenshot visually reviewed; page errors, console errors and downloads zero. Existing build directive/dynamic-import warnings remain. This is recovery guidance, not an automatic deselection or new reference-matching algorithm. #23 remains open pending its separate original acceptance audit. Full repository suite, imported STEP seams and accessibility certification are not claimed. No downloads.

Commands from Studio with Node22.19.0 and shared heavy lane:
- focused `fillet-pick-failure` and `fillet-family` tests
- Studio TypeScript, affected-file ESLint, Vite build
- `PICK_RECOVERY_FROZEN=1 PW_DIR=... CHROME=... node test/fillet-preview-pick-recovery-browser.mjs OUTPUT`
