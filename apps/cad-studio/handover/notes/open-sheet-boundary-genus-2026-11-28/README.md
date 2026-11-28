# D2214 — Report the genus of open B-rep sheets

P0 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#770](https://github.com/barocss/cad/issues/770) · Base `f7db657c1`.

The report certifies each open shell's paired uses, boundary cycles and vertex fans, then includes the boundary count in Euler–Poincaré. An open body whose incidence cannot establish an orientable manifold genus reports `null`. The public `BrepBodyTopology.genus` type is now `number | null`. Existing closed-body values and B-rep validity rules keep their original behavior.

- **FAIL, original current main.** The archived exact rectangle had 6 vertices, 7 edges, 2 faces, 2 loops and one boundary cycle. It was strict-valid, with no issues or geometry gaps. Its genus was reported as 0.5.
- **PASS, exact input replay.** The same rectangle reports genus 0. All other report fields and the input match the original. Focused checks cover disks, multiple boundaries, self-loop circle edges, a same-face seam, a punctured genus-one shell, separate shells and closed solid controls. The accepted D194 boundary contacts retain their validity and report a null genus.
- **PASS, actual desktop.** Chrome Studio created the original two-cylinder Band surface. Editing the larger radius from 20 mm to 25 mm changed its native area from 2,980.376480 to 3,688.027734 mm², in agreement with the frustum calculation. Undo/Redo and project Save → Close → reload → Open retained the exact document. Native reads of the authored and reopened documents report genus 0 for the open Band and both closed cylinders. The driver used existing test hooks to select the source faces. It recorded 1,290 frozen sources and zero page errors, console errors or downloads.
- **PASS, affected checks.** 92 emitted Kernel, 28 Model and 8 Studio tests. Kernel, Model and Studio types, scoped lint, whitespace and the production Studio bundle passed.
- **FAIL, first test fixture.** Its rectangle edge IDs used a separator that the existing curve validator refuses. The corrected fixture uses supported identifiers. The code-shape guard has the same eight existing failures as the parent.
- **NOT_RUN.** Full local suites, mobile and deployment. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/native-checks.sh"
bash "$OUT/run.sh" desktop-fixed
git diff --check
```
