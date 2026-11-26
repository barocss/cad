# D2034 — Preserve the earlier cut on mixed straight Path patterns

P1, [#25](https://github.com/barocss/cad/issues/25). On upright rectangular stock, an explicitly selected earlier original circular through-Subtract can now be copied along linked exact straight XY spans after later original rectangular and circular through-cuts. The operation transforms the original cutter to the sampled positions without rotating or sweeping it. Existing Path profiles and archive schema are unchanged. Mixed curved Path, arbitrary original cutters and generic reference repair are outside this milestone.

## Desktop acceptance

- Real macOS Chrome 158 / WebGPU: [Browser](studio/browser.json) and [History](studio/history.json) both commit the earlier `n4` cutter against latest body `n10` and link the same `obj_1`. Their applied, edited and newly reopened document captures are byte-identical. The earlier bore, later R3 at (38,26), and the rectangular through-cut retain their exact cap boundaries and the distinct bore walls keep their native names and locations.
- On a 60 × 40 × 10 mm plate, three copies at pitch 12.5 mm land at (10,22.5), (19,26) and (31.5,26). [Pitch 13 mm is tangent](studio/03a-later-r3-tangent-refused.png), and 13.125 mm overlaps the later R3 at the last copy. Both refuse without changing the document or history. The control cases also reject touching the source and exceeding path length.
- Changing pitch 12.5 → 12 mm moves the copies to (10,22), (18,26) and (30,26). Undo, Redo, native Save, and [fresh Open](studio/06-fresh-open-circular-path.png) keep the same source and path references. The native solid has one closed shell, genus six, and volume 23,920 − 250π = 23,134.601836603 mm³. The existing single-later-rectangle Path fixture also passed in Chrome.
- The kernel regression checks the distinct original owners and ordinal copy walls, strict B-rep, same native B-rep after reopen, and preservation of the refusal boundary for mixed polynomial quadratic and quarter-arc paths.

## Original issue scope

| Original UX acceptance | Evidence |
| --- | --- |
| Linear signed drag through zero and per-axis Count/history | [#25 verification log](https://github.com/barocss/cad/issues/25) |
| Circular X/Y Count and actual result in creation/history | [X workflow](https://github.com/barocss/cad/issues/25#issuecomment-6912301006), [Y Separate proof](https://github.com/barocss/cad/blob/1d857f2fcb288461cb905e682200edfc76418231/apps/cad-studio/handover/notes/circular-count-preview-history-2026-11-14/qualification.json), [Y One body](https://github.com/barocss/cad/issues/25) |
| Earlier cutter identity from Browser and History | [Original mismatch and guard](https://github.com/barocss/cad/issues/25#issuecomment-6912137284); [Linear](../prior-circular-mixed-linear-2026-11-26/README.md), [Rectangular](../prior-circular-mixed-grid-2026-11-26/README.md), [Fill](../prior-circular-mixed-fill-2026-11-26/README.md), and the two Path flows above |
| Explicit post-pattern copied-face Hole, path length and valid follow-up edits | [Circular Hole](https://github.com/barocss/cad/issues/25#issuecomment-7031394894), [linked Path Stretch](https://github.com/barocss/cad/issues/25#issuecomment-7034655678), [Linear direction reversal](https://github.com/barocss/cad/issues/25#issuecomment-7037620391) and the Path spacing edits above |

Run the mixed desktop fixture through both entry points:

```sh
export D2034_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs /tmp/cad-path-browser --mixed
node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs /tmp/cad-path-history --mixed --history
```
