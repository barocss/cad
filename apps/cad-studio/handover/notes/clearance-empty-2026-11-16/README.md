# Clearance empty results (#67)

An empty ready result now says `No candidate pairs within the current Near band`, without repeating the input's number. Color chips appear only when candidate pairs exist. Details no longer duplicates chip colors; it preserves the display-mesh gap limitation and the distinction between contact overlap classification and pending/refused results. Pair labels, gaps, overlap volumes/refusals and overlay computation are unchanged.

## Verification

- Clearance unit tests: 8/8 PASS. Added empty/evaluating/error presentation and candidate legend/name/gap/refusal checks; existing draft/commit behavior tests retained.
- Changed-file lint and Studio typecheck/build PASS. Initial numeric fixture version was corrected to the typed clearance-map version before final validation.
- Chrome WebGPU 1024×800 and 1440×900: actual bracket fixture instances at X0 and X30.5. Near 1→0.2→1 mm yields one pair/two overlays → no pairs/no overlays → identical recovered pair/overlays; 0.5 mm gap and Bracket A/B names retained. Empty has no legend, candidate has one. Details works with keyboard Enter and retains interpretation help without duplicate colors. Repeated transitions and None/reopen leave document and placement unchanged. Narrow empty screenshot reviewed.
- Existing `clearance-near-draft-browser.mjs` also PASS at both widths: editing/invalid draft/Enter/blur/Escape, candidate threshold, None, Undo/Redo sentinel, same-ID Open reset, actual Save and fresh Open.

## Limits

Browser fixture covers near/empty, not contact/overlap/refused geometry. Refusal presentation is tested with a synthetic pair in unit tests. No screen reader, other browser or full suite claim. No analysis algorithm, manufacturing, physics, pose or persistence change. #126 protected WIP preserved.
