# Draft Extrude interior-radius support audit (#156)

No duplicate product implementation was needed. Current `engine/mesh.ts` exposes `nativeFinishLine` for verified straight native edges between planar faces (d4c462047a); `app/commands.ts` offers Radius controls for nativeLine/nativeFinishLine. The existing short planar contact-cut fix 9228c1306d68201408b35e912ef9c4e77d146f8e and prior drafted Fillet tests cover the geometry path.

This change adds `--support` to `test/drafted-extrude-variable-fillet-browser.mjs`: independently open 40×30×10 four-wall Draft stock at 8° and 12°, select its actual top front edge, then create a new Circular varying Fillet using both interior controls. Each angle is exercised at 1024×800 and 1440×900, rather than treating an upstream angle edit as proof of initial creation support.

PASS: all four real Chrome WebGPU flows, Radius controls visible, preview and apply with radii [1.25,3,1,2.5] at [0,.25,.625,1], strict native B-rep and independent geometric oracle, Undo/Redo, actual Save and fresh Open. Artifacts: `/tmp/cad-drafted-fillet-support-20261116`; 1024/12 preview screenshot visually inspected. Changed driver ESLint PASS. No product code changed, so production build was not rerun for this test-only commit; the preceding exact product revision passed build and CAD CI.

Limits: these angles/stock/straight native edge only. This does not widen arbitrary curved or unsupported edges, kernel capability, or claim assistive-technology coverage. Existing ordinary driver mode remains available; #158 full ordinary mode passed before this additive test mode. #126 WIP preserved.
