# D1963 — Expose the original annular inlet plane to local Agent proposals

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md). [#324](https://github.com/barocss/cad/issues/324). Base `285deffa5d1e594c3c3660f571e06bf72ddf8e1f`. Small local Agent discovery change.

The Offset face command description now includes the original perpendicular annular inlet alongside the outlet. The D1960 native plane binding uses the existing current-revision proposal and Studio approval workflow.

- **PASS, local MCP.** Discover the inlet, dry run the original `n1.start` against `n3.side1` on donor `n4`, and stage P1. The dry run reports a 37.699 mm³ increase. A stale revision and a nonparallel donor refuse without changing the part. MCP cannot accept the staged proposal.
- **PASS, actual desktop Studio.** P1 displays the named inlet and donor. Preview and Hide leave the accepted document unchanged. Moving the donor disables Preview and removes Accept for the stale proposal. On the original reviewed revision, explicit user Accept commits the linked inlet. Save and fresh Open keep the original source and donor.
- **PASS, independent native geometry.** The inlet moves from X−10 to X−14 mm. The annular area is 3π mm² and the extension is 4 mm. Native volume is 670.3268691075 mm³. The approved and reopened native inspection records match the manual D1960 result byte for byte, including all 12 junctions, the untouched outlet and the unchanged donor.
- **PASS, affected checks.** 26 Model and six Studio checks, Model types, scoped ESLint and diff check.
- **FAIL, corrected driver comparison.** The first driver compared the rounded MCP display volume against the native precision tolerance. The final driver checks the three-decimal MCP result and retains the independent native check.
- **NOT_RUN.** Revision-pinned Agent render and inspect, paid providers, full local suites, separate production build and mobile. #324 stays open. First mechanical CAD remains 8/10 accepted. Overall CAD remains unmeasured.

```sh
D1963_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-outlet-reference-plane-browser.mjs "$OUT/studio-final" --inlet --agent
node packages/barocss-cad-model/scripts/test.mjs perpendicular-annular-inlet-offset offset-to-plane tool-contract proposals.test
node apps/cad-studio/scripts/test.mjs tool-contract-mcp command-build-failure offset-plane-pick-feedback
pnpm --filter @barocss/cad-model type-check
git diff --check
```
