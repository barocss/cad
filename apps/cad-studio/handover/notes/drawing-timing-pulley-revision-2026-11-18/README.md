# Timing pulley drawing revision (#724)

Based on main 251139442. Synthetic timing-belt row; manufactured pulley, default Part:base scope, not a bought-only envelope.

Actual Studio Open → issue A → Library Drive rows file pitch 5→5.2 changes SVG view paths and volume 11185.429047468406→12277.91480810971. Baseline stale=0; fixed stale=1. Fixed flow also passes Undo/Redo, Save/fresh Open retaining the issued stamp, and explicit issue B clearing stale. Local PNG pixels reviewed. Frozen source changes=[] and contexts/browser/server closed.

Only active timing pulley row pitch, pitchLineOffset and groove are tracked. Thickness, citations, unused rows and suppressed consumers are excluded. Existing last-row lookup is retained. Ordinary legacy stamps stay exact; old timing-backed issues retain their saved stamp and require explicit reissue. This is not a geometry validity or manufacturing certificate. V/flat pulley, belt and coupling coverage is not claimed.

Focused and related revision regression: 36/36. Actual Chrome PASS. Model type check PASS. Studio type check and owned-file lint PASS.

A preliminary edit/test command used the app cwd with repository-relative paths and failed before modifying any source. Corrected cwd; no product failure inferred.
