# D1379 — curvature scale retention

#149 completed. Preserve the last scale for a hidden curvature result owned by the same selected curve. Visibility and cached preference are distinct. Different direct IDs/document generations and native owners still clear state; native tickets still reject obsolete asynchronous results. No measurement or renderer changes are intended.

Verification completed at the bounded scope below. #148 viewport clipping and #152 legacy provenance remain separate open work; existing HOLDs and aggregate baseline limitations remain.

## Intermediate findings

Initial browser assertions passed but the freeze watcher rejected a concurrent test-only fixture type correction. The next run exposed native pending keyboard-focus loss: disabling the focused button can blur it while waiting. Pending now uses aria-disabled/aria-busy and an explicit no-op click guard, so it remains focused without permitting duplicate requests. The final browser test deliberately delays native worker posts150ms and presses Enter again while pending. A post-run version diagnostic used the wrong relative Vite path; this did not run product code or change files, and is not a browser-test result.

Hook tests3/3, typecheck and scoped lint passed before this pending-button follow-up. Existing actual Reverse and same-ID pole edit regression also passed with scale8 retained and updated independent curvature oracle (receipt `e0cd2a172f87ee258e623bd04bdb72e1d1e64dedcf8f4d7aeb834069b05c6914`). The final checks below include the pending-button follow-up.


## Final verification

- Hook/readout tests5/5, Studio typecheck, scoped lint, diff check and final production build PASS.
- Actual Chrome1024×800/1440×900: direct rational arch and native R4/G2 retain scale8 across repeated mouse and Enter hide/show. Actual SVG strokes are identical before/after; numeric curvature and documents stay unchanged. Different direct selection and same-ID replacement document reset to4. Existing straight clear/single-value and varying-range controls pass.
- Native worker requests deliberately delayed150ms: pending button retains keyboard focus, reports aria-disabled, and repeated Enter does not add requests. Completed measurement preserves focus. Hook tests additionally cover pending scale changes, stale success/error, newer requests and owner/unmount changes.
- Final browser receipt `c95cf07f54e58b705fce2427762f8ed14a6cb3a9ef4ced414f850f0d739568ad`. Actual direct1024 and nativeG21440 screenshots visually reviewed with scale8 and retained comb.
- The earlier existing Reverse/same-ID edit regression validates measurement recomputation at retained scale8; it preceded only the button-pending focus adjustment, not a later hook change. No full-suite, assistive-technology or clipping-fix claim.
