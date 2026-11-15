# D1373 — Recognize native arc support independently of display chords

Issue #150.

PARTIAL: selected-arc scope label remains unimplemented, #150 stays open. Model tests 16/16, Model/Studio type checks, scoped lint and production build PASS. Actual Chrome 1024/1440 drawn ellipse 12x6 extruded 6: two picked regions show Arc/radius3 and24 with unchanged source. Native all-arc checks at display qualities1/8/16; real Line, legacy fit and full circle controls retained. Single-chord arc length is omitted because circle support cannot distinguish minor/major/full interval. Receipt 92f3979af522f3851cee8586f5112af4587b8fb4ede54f2418c6ce677225f85c. Browser does not explicitly assert edge IDs or curvature comb. First driver used unavailable History selector; corrected driver only.

Actual screenshots reviewed. Focused evidence is not whole-CAD/full-suite/CI acceptance. Existing geometry, manufacturing and fitter HOLDs remain. Prior unrelated lint/API baseline failures are not claimed fixed.
