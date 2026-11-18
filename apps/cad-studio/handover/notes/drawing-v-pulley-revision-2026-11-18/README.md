# V pulley drawing revision (#725)

Based on main da3859af3. Synthetic V-belt row, two-groove manufactured pulley datum diameter80/bore12, default Part:base drawing scope.

Actual Studio Open → issue A → Library Drive rows file aboveDatum2→3 changes SVG view paths and volume120317.96473210932→122335.15616986172. Baseline stale0, fixed stale1. Fixed flow also passes Undo/Redo, Save/fresh Open preserving the issued stamp, and explicit issue B clearing stale. Local PNG pixels reviewed, frozen source changes=[], contexts/browser/server closed.

Track active V pulley row angle, datumWidth, aboveDatum, belowDatum and edge. Spacing is included only when an active consumer has multiple grooves: single groove consumes zero spacing; shared multigroove consumers reserve it. Actual volume comparisons cover each field. Thickness, citations, unused rows and suppressed consumers excluded; last-row lookup preserved. Ordinary legacy stamps unchanged; saved prior V-pulley issue stamp stays intact until explicit reissue. Timing/sprocket contracts retain regression coverage. No flat/belt/coupling or manufacturing-validity claim.

Focused and related revision regression42/42. Actual Chrome, Model/Studio type checks and owned lint PASS. All checks against frozen final product source.
