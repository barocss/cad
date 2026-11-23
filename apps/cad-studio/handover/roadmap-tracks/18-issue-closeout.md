# GitHub issue closeout queue

Snapshot 2026-11-23 at 14:15 UTC. GitHub reports 224 open issues, 0 open pull requests and 0 issue closures in the preceding 24 hours. A title review finds 92 research, design, plan or roadmap cards and 16 goals or epics. Nine open issues carry the bug label. These are tracker counts. Feature readiness uses the [scenario acceptance matrix](04-product-baseline.md).

| Priority | Issue | Existing proof | Remaining closeout condition |
| --- | --- | --- | --- |
| Accepted | [#229 Two-point snap](https://github.com/barocss/cad/issues/229) | [D1816](../notes/two-point-rectangle-snap-closeout-2026-11-23/README.md) verifies the remaining plane and temporary-state cases and reconciles the original Rectangle contract. | Post the verified acceptance and actual Studio scenes on the issue after exact CI. |
| 2 | [#268 3D annotation picking](https://github.com/barocss/cad/issues/268) | Actual WebGL2 SVG fallback, WebGPU planar and facing hits and one WebGPU native Save/Open case have verified receipts. | Verify the mode boundary and supported renderer transitions, including a changed raster and rejected old hit target. |
| 3 | [#279 STL coordinate collapse](https://github.com/barocss/cad/issues/279) | Typed collapse refusal, independent normal STL readback and atomic two-lump output are verified. | The issue keeps the non-precision Worker fallback case open. Obtain a real matching visible-body fixture before closing. |
| Held | [#35 Fit callout and H7](https://github.com/barocss/cad/issues/35), [#29 Direct editing](https://github.com/barocss/cad/issues/29) | Both have verified partial fixes. | The PDF convention decision and the protected Split and rendering slices remain separate dependencies. |
| Parent scope | [#10 Sweep](https://github.com/barocss/cad/issues/10), [#324 Agent review](https://github.com/barocss/cad/issues/324) | D1810 through D1814 deliver and verify four-span Sweep and pinned local review. | #10 still needs broader path and frame laws. #324 still needs wider client and cost results. |
| Checklist | [#44 Desktop modeling UX](https://github.com/barocss/cad/issues/44) | The snapshot has 210 of 220 boxes checked. The unchecked #27 entry already has a closed child and retained Studio proof. | Reconcile the closed child and keep each unresolved child tied to its own proof and owner. |

Use current source and retained evidence to fill the exact acceptance gaps. Run the smallest missing Studio case and record actual test scenes on the existing issue. Close an issue once all of its scoped criteria have evidence. Keep feature delivery and closure counts in the current roadmap report.
