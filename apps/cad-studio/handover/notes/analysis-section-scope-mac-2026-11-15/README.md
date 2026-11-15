# D1396 — analysis section scope

## Scope

Resolves #606 using its explicit display-scope alternative, not a change to thickness computation. The existing map legend labels `Body mesh` or `Section display mesh`. The latter requires the actual map input to be sectionBodies and either settled exact sections or CPU clipping. GPU-only/pending-exact clipping still uses body meshes. Equal volume does not establish source identity; exact Cut-out decomposition keeps section-display provenance even when total volume equals the original.

Metadata is separate from scalar arrays. Values, ranges, thresholds, algorithms, section construction and native face-selection authority are unchanged. The default is deliberately not named Original: other display routes need not be the committed source. #605 ownership guards remain and include scope transitions.

## Verification

- Focused 26/26 PASS: pure provenance, existing legend rendering/metadata forwarding, actual CPU plane/Box/Cut-out paths, equal-volume provenance fixture, retained map/section/hover tests.
- Targeted non-App lint, diff check, Studio TypeScript and production Vite build PASS. The unrelated App `_k` baseline remains; no full-App lint claim.
- Actual Chrome WebGPU, 1024×800 and 1440×900, 34 probes: original → Y section → flip/move → off; Box cap versus original face; two/three-plane Cut-out add/remove/re-add; forced GPU-only and CPU clipping through existing supported debug controls.
- Independent rectangular volume controls: original3280, Y half1640, Y=1 kept1248, Box1760, Cut-out2920→3280. Source document stays exactly unchanged.
- Observed map samples (not physical thickness truth): original Tall5.33, Y-section2.67, movedY2.00; Box cap5.33 without editable selection and remaining original Short4.00; three-plane Cut-out Short3.33 despite full3280 volume. Off restores Tall5.33/Short6.00.
- Forced GPU-only says Body mesh with shown volume3280; forced CPU clipping says Section display mesh with1640. Neither nonexact route gains editable face selection. Settled exact original faces retain normal source selection; removed regions show no sample/selection; caps gain no native editing authority.
- Actual reviewed screenshots: 1024 three-plane/GPU and 1440 Box/CPU. The caption is readable inside the existing220px legend without clipping. No new panel or explanation layer.

## Evidence and limits

Final browser `/tmp/d1310-publish.1Wqzsz/d1396-second`; receipt SHA256 `8e2408bd6d04ce396aa0b5b32befcff429e006561d2f3bce8fc5684d962cf9fa`. No source changes or page/console errors; owned contexts/browser/server closed.
Build log `/tmp/d1310-publish.1Wqzsz/d1396-build.log`.
First run is retained as a failed test expectation: it required editable original-face selection in nonexact GPU-only mode. Existing App deliberately refuses that authority. Only those nonexact expectations were corrected; settled-exact selection assertions remained. Final second run alone qualifies the full browser matrix.
Precise moved planes and Cut-out definitions use the supported development section setter, with actual UI mode/flip/add/remove controls. GPU/CPU fallback controls use the existing development debug hook. These are not claims that every path was entered exclusively by UI gestures.
No numerical algorithm, all-body normalized legend range, manufacturing, mobile, assistive-technology or whole-CAD acceptance claim. Existing HOLDs remain unchanged.
