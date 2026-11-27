# D2035: Repeat an earlier through-cut on a mixed curved Path

P1, [#760](https://github.com/barocss/cad/issues/760). On upright rectangular stock, repeat an explicitly chosen earlier circular through-Subtract past later original rectangular and circular through-Subtracts on a linked, constant-Z single polynomial quadratic or canonical quarter arc. The existing certified path planner gives fixed-orientation XY offsets; the existing mixed-chain certificate verifies the original cavities and the clearance of every translated copy before applying cuts. No file/schema, supported curve family or default-source change. [D2034](../prior-circular-mixed-path-2026-11-26/README.md) remains the straight-path precedent.

## Desktop qualification

- Real macOS Chrome 158. For both curve forms, Browser and History select original Subtract `n4` on latest body `n10`, link the authored curve, create the pattern, edit the spacing, undo/redo, then save and open in a new session. The accepted, edited and reopened documents match between the two entry points.
- On the 60 × 40 × 10 mm plate, quadratic spacing changes 14 → 15 mm; quarter-arc spacing changes 19 → 20 mm. Independent closed-form arc-length oracles verify the translated R2 positions, unchanged original R2/R3 and rectangular cuts, strict single closed solid (genus 4), volume 23,920 − 170π mm³ and centroid. The straight mixed fixture also passes independently.
- For each curve the exact tangent and overlapping positions against the later R3 refuse without changing the model or history. Source contact and exceeding curve length are also refused. The native suite separately checks unchanged original wall ownership and file round-trip, and refuses blind cuts, varying Z and unsupported rational weights.

| Linked curve | Browser | History | Chrome evidence |
| --- | --- | --- | --- |
| Polynomial quadratic | [Receipt](studio/quadratic-browser.json) | [Receipt](studio/quadratic-history.json) | [Fresh Open](studio/quadratic-open.png) |
| Canonical quarter arc | [Receipt](studio/quarter-browser.json) | [Receipt](studio/quarter-history.json) | [Tangent refusal](studio/quarter-tangent-refused.png) · [Fresh Open](studio/quarter-open.png) |
| Straight regression | [Receipt](studio/straight-control.json) | [Prior D2034](../prior-circular-mixed-path-2026-11-26/README.md) | — |

Local verification: 127 native pattern tests passed and both kernel and Studio type checks passed. Three historical refusal fixtures wrongly expected two original through-bores to fail even on the previous main; replace that stale case with a rectangular source plus a later circular cutter, which is still outside that certificate.

Arbitrary earlier cutters, blind or transformed cutters, general paths, and relinking remain outside this milestone. #760 stays open. General reference rematching remains [#20](https://github.com/barocss/cad/issues/20).

```sh
export D2035_SOURCE_FROZEN=1 D2034_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
for curve in quadratic quarter; do
  node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "/tmp/cad-$curve-browser" --mixed "--$curve"
  node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "/tmp/cad-$curve-history" --mixed "--$curve" --history
done
node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs /tmp/cad-straight-control --mixed
```
