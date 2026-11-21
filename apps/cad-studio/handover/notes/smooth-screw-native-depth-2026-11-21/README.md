# D1554 — Compare Smooth Screw triangle depth with the native surface

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base e31a7e1faa12a9b28a36deabfdb3ea516bd14984.

Capture the D1552 Screw in actual Studio with AO off. Read its perspective camera and canvas extent. The inspector recovers the current refined packet and confirms that its positions and indices agree exactly with the q24 mesh. The CPU oracle projects those triangles at the actual camera and recovers their closest depths. Separately evaluate each native wall from its two cubic control rows. In the plane perpendicular to the screen ray, bracket zeros of the projected ruling determinant, recover the across-wall coordinate, and choose the nearest wall or cap hit. Compare scans at 2,048 and 4,096 axial intervals. This sampled root check does not certify grazing or double roots outside the measured pixels.

- **PASS, actual desktop WebGPU capture.** Open the D1552 saved Screw with its 1,092-triangle refined packet, exact camera and digest c91e769225d1c08554ca7556ca23ed70b32cbac73530d0f4ee1278889f02a661. The frozen run reports zero runtime errors, console errors and source changes.
- **FAIL, measured display fidelity.** Both native scans agree at 444 sampled pixel centres in the two D1553 crease regions. The q24 triangle packet reaches maximum depth discrepancies of 11.4344 and 9.0995 mm against the sampled native first hit. The 2,182-triangle q48 diagnostic still reaches 10.6222 and 9.2419 mm. Hit counts and face IDs agree across these regions. Multiple intersections on the same curved wall can still differ in depth. Neither packet has any interior side samples.
- **PASS, independent structured mesh trial.** Two intervals across each ruled wall and 96 along, with native interior knots included and exact planar cap triangles retained, create 1,876 triangles. The same sampled maxima fall to 0.73274 and 0.73372 mm, with no wrong-face or coverage differences in these regions. This is an offline comparison of candidate geometry. The two-interval grid has the lower worst error at both witnesses but can shift individual and median errors.
- **PASS, affected checks.** Browser driver syntax, scoped ESLint, the independent Python probe and Git diff.
- **NOT_RUN.** Upload or selection of the trial grid in Studio, exact per-pixel GPU depth, a full-view or certified root proof, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate the browser and retain capture and measurement files outside Git.

```sh
pnpm exec eslint apps/cad-studio/test/smooth-screw-depth-browser.mjs
node --check apps/cad-studio/test/smooth-screw-depth-browser.mjs
git diff --check
SCREW_DEPTH_FROZEN=1 node apps/cad-studio/test/smooth-screw-depth-browser.mjs "$EVIDENCE" "$D1552/agent-approved-smooth-screw.bcad"
python3 -BI apps/cad-studio/test/smooth-screw-depth-oracle.py "$EVIDENCE"
```
