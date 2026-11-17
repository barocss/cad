# Custom instance-pattern direction vectors

Baseline `8e71db226`; integrated after disjoint `2d40f7e2c`. Studio exposes Custom X/Y/Z direction components for both linear and circular instance patterns. Previously UI creation offered cardinal axes only, and imported Custom was read-only. Existing Model `dir` / `axis` fields and validation are reused, with no schema/API/kernel change. Unchanged source vectors are omitted from edits; explicit cardinal choices remain cardinal. Blank components are invalid, not zero.

## Actual validation

- First actual Chrome run PASS: create linear direction [0,3,4], spacing10, giving copies [0,6,8]/[0,12,16].
- Zero-vector creation and blank-component edit refuse with document unchanged. Edit Z to -4, Undo/Redo, native Save download/fresh Open preserve [0,6,-8]/[0,12,-16].
- Explicit X selection restores cardinal [10,0,0]/[20,0,0].
- Circular axis [0,3,4], origin[10,20,30], seed[50,0,0], 90-degree steps yields [8,30.4,-22.8] and [-30,-3.2,2.4]. These literal oracle values follow independent Rodrigues arithmetic, not product placement helpers. The first copy lies below the base plate in the screenshot; viewport visibility of every copy is not claimed.
- Stable IDs/shared definitions, unchanged base source. Focused Studio draft tests6/6; pre-integration Studio type/targeted lint/diff check PASS.
- Screenshots directly reviewed, synthetic fixture only.

NOT_RUN: circular file roundtrip (actual file flow is linear), arbitrary mates/nested patterns, extreme vector magnitudes, exchange exports, rotation-matrix accuracy beyond existing Model semantics. Not #263 Non-Rotate; HOLDs unchanged.

Run: `PATTERN_DIRECTION_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/instance-pattern-direction-browser.mjs <artifact-dir>`.
