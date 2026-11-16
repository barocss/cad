# Quarter-rim height boundary diagnosis (#624)

Base f7c4303b59fe32c98928ebe6ad0779efd8835d68. No product changes. Issue: https://github.com/barocss/cad/issues/624

`node test/fillet-circular-height-diagnostic.mjs /tmp/cad-height-diagnostic` runs a minimal R8 quarter-disk with Circular endpoint radii 1.2→0.6, no stored signatures. It is a diagnostic report, not feature acceptance.

Actual output `/tmp/cad-fillet-height-boundary-clean-01`: H10 control PASS strict B-rep (volume 500.45053080071904 mm³); H12 with authored at.z10 FAIL; H12 with fresh at.z12 FAIL. Both failures: analytic Boolean n1.top/n2.face boundary bracket has no inside starting point. Original saved-document variants with sigs reproduced the same pair of refusals in `/tmp/cad-fillet-height-boundary-01`.

Source contract: Model passes atEnd:true; native part-finish.ts atChainEnds replaces authored points with current topology endpoints. If old points remained, edge-finish.ts onCurve selection checking would refuse earlier. The evidence excludes stale coordinates/signatures as the sole cause; it does not identify the numerical root cause. Do not relax tolerances or clamp/project geometry to manufacture success. Existing actual browser evidence preserves accepted doc after refusal; successful H12 editing remains FAIL and H12 physical oracle NOT_RUN because there is no accepted solid.

Separate #118 multi-edge review: nativeVertices and nativeJoint can prove a connected open chain, but creation chainEnds uses rounded coordinate keys. Native endpoint partitions must agree with command-created endpoints; no nearest-point connectivity. No verified successful multi-straight varying fixture was found: varying around corners is explicitly refused in rolling-ball.ts, and collinear display merges remove the required identity fields. Do not add an unverified endpoint feature merely to fill the branch. #118 stays open.

Next: instrument the original boundary bracket failure for #624 within bounded existing analytic intersection contracts. WIP/HOLD preserved. No broad numerical campaign, new kernel admission, package release or deployment. Diagnostic executes existing native source via esbuild; it does not patch product imports. Prior focused checks remain attached to f7c4303b5 rather than claimed re-run here.
