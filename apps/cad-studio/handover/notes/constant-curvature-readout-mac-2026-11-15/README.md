# D1378 — constant curvature readout and clear action

#147: keep the existing seven-significant-digit precision but show one value when the two formatted sample extrema agree. Actual varying G2/rational ranges remain ranges. A zero-curvature result has no comb strokes, so its button says Clear curvature; nonzero results still say Hide curvature comb. Measurement data, adjacent-face continuity, scale calculations and state ownership are unchanged.

## Verification

- Focused readout tests2/2 and adjacent Sweep labels2/2 (combined4/4), scoped lint, Studio typecheck and production build PASS.
- Actual Chrome1024×800/1440×900 PASS: direct and native straight both show single0, Clear curvature, no comb/scale and keep Enter focus. Native R4 semicircle shows single0.25 with16strokes. G2 retains0.09090197–0.9918771 with8strokes; rational arch retains its varying range with16strokes and an independent derivative oracle. Scale4→8 doubles SVG comb lengths only; readouts and documents remain unchanged. Direct selection change clears prior results.
- Final receipt SHA256 `ef72e067c06d952d7a7ad2ee8529ad5ba342a81dde47ae9d3d80bd6c8223bb8d`; actual direct/native straight, semicircle and G2 screenshots visually reviewed. An intermediate run failed only the frozen-source watcher because this progress note changed during the run. Final repeat held all files fixed and passed.
- #147 completed at this scope. Assistive technology and the broader existing suite are not claimed.
- No change to #149 hidden/show scale reset or #148 viewport clipping. Those are separate open issues.
- Existing aggregate docs inventory/refusal and obsolete Cannot offset label remain unresolved; no whole-suite or CI assertion.
