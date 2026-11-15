# D1358 — Readable exact inline dimensions

Completes barocss/cad#65. Base main `7e7688e93fb9c7e20728e67bf423238b9043d659`.

## Change

`ui/inlineDimensionLayout.ts` sizes the input from the unrounded string, with 84–244px nominal bounds and available-area clamp. Parent width and position use the same calculation; arc mode retains its 57px control allowance. `InlineSketchDimension.tsx` keeps exact String(value), valueAsNumber, Enter/Escape and radius/diameter conversion unchanged. Initial focus selects all and restores left scroll position. This is presentation-only; no numeric truncation is introduced.

## Verification

- Focused 5/5 (new layout/SSR2 plus existing ownership3), Studio tsc, scoped lint, diff check and production build PASS.
- First actual Mac Chrome run at1024/1440 PASS. Exact 44.721359549995796 appears from its leading digits, full string fits, scrollLeft0. Root visually reviewed both screenshots.
- Escape keeps the document and point-pair command available. Unchanged Enter may intentionally add the requested driving constraint but keeps all four rectangle coordinates within1e-8 and native volume4000 within1e-6; no accidental dimension rounding.
- Precise horizontal42.1234567890123 is stored exactly in the driving rule, with corresponding Extrude volume. Both cases preserve following Extrude and pass document Undo/Redo; precise edit passes actual Save/fresh Open.
- Receipt `d1358-first/receipt.json` SHA256 `8a397e414f50c6138d638da6c7498eb23ec1cd249717387eb98954078273d241`; product source frozen throughout.

Arc/scientific/negative/tiny-area layout is unit coverage, not additional browser interaction qualification. No full-suite, CI, alternative-browser or screen-reader claim. Existing HOLDs retained. Next D1359/#134, saved overlaid-line Trim guidance and inspection ownership.
