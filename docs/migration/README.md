# Repository migration

BaroCSS CAD starts from the CAD work on [barocss/barocss's local/cad-dev](https://github.com/barocss/barocss/commit/92c4b3e48f5648aff6cbc52629d227724b1759c0).
At extraction, that commit contained the observed [develop](https://github.com/barocss/barocss/commit/0a838f9543a29a864df5917ac2bb877540c8aa73) head
and 831 further commits. The source repository retains the original commit and pull request identities.

The [export paths](export-paths.txt) cover Studio, Viewer, library docs, CAD React, CAD Model, CAD interop,
the kernel, GPU, CAD-linked physics, and their tracked examples and CAD-specific workflows.
The first filtered tree matches all 36,490 selected source entries by path, mode, and object ID.
The [commit map](commit-map.tsv) links 6,501 original commits to their filtered commit IDs.
A mixed commit keeps its CAD path changes in the filtered history. Changes to CSS and UI packages remain in the original source.
The original commit messages and authors are retained. Filtered commit IDs and ancestry can differ.

## Verified local workspace

- **PASS** for a frozen, offline pnpm install from the existing cache on Node 22.19.0 and pnpm 9.15.4.
- **PASS** for Studio's production build, Viewer's bundle, and the documentation site's production build.
- **PASS** for the actual desktop WebGPU Studio flow. Author the open-rim variable fillet, edit the end radius, undo,
  redo, save, and reopen. Strict native geometry checks and local MCP discovery and dry run also passed.
- **PASS** for the first [CAD CI](https://github.com/barocss/cad/actions/runs/43606656234) run. It installed the workspace, built Studio, Viewer and docs, and ran the focused Kernel and Model facade tests.
- **NOT_RUN** for broad suites and the unfinished D1274 Studio acceptance.

## GitHub history

The existing source repository includes 2,164 issues and 455 pull requests. There were zero open PRs at the inventory checkpoint.
The [pull request index](pull-requests.tsv) identifies 191 PRs that changed exported paths. It records their
states, source URLs, base and head commits, merge commits, mapped commits where available, and the path counts
available for classification. For PR #2221, GitHub supplied 3,000 of 3,402 paths, and the surviving local diff
lists 3,375. The index flags that row as partial.

GitHub cannot change a PR's base repository. The links lead to the original reviews, comments, checks and
merge status. The [commit map](commit-map.tsv) locates corresponding CAD source when the filtered history includes it.

The [CAD wiki](https://github.com/barocss/cad/wiki) holds the selected CAD, GPU, Viewer, Loader, Motion, Physics and
shared 3D material. The first import retained 578 wiki pages, 1,323 linked files and 3,174 filtered wiki commits.
The link update added three existing B-rep attachments and fixed references within the new wiki and back to
source pages. A later import added three CAD language and standard-part pages.
The original wiki removed the migrated pages from its current tree and points readers to this wiki.

The [open issue map](open-issue-transfers.tsv) records 376 native GitHub transfers. Titles, state and labels
were checked against the inventory, and an original URL redirect was verified. The [source-open index](source-open-issues.tsv)
records the other 40 issues from that checkpoint, including cross-project and original-project work.
The [closed issue index](closed-issues.tsv) records 1,046 closed issues with explicit CAD or related 3D module titles. It links
to their original closed state and timeline. Titles outside that filter can be reviewed in the
[original issues](https://github.com/barocss/barocss/issues?q=is%3Aissue+is%3Aclosed).


## Source repository cleanup

[PR #2635](https://github.com/barocss/barocss/pull/2635) removed the migrated CAD files from the active source
workspace on `develop`. The original `local/cad-dev` remote branch was deleted after its last commit was matched
against the filtered history. Historical source commits remain available by their original IDs.

The [closed issue transfer map](closed-issue-transfers.tsv) records each completed transfer and its redirect.
The first source cleanup verified 122 closed issue transfers. On 2026-11-15, 75 additional closed issue transfers
passed checks for the redirect, title, closed state, resolution reason, comment count, labels, and assignees.
The closed issue index has 849 entries without a verified redirect in the map.

The [pending transfer map](pending-closed-issue-transfers.tsv) records destination numbers returned by GitHub
while the source redirect or metadata is pending. Confirm both before retrying a transfer. Source
[#731](https://github.com/barocss/barocss/issues/731) now redirects to [#542](https://github.com/barocss/cad/issues/542),
which retained all five comments. The second request created #543. It was deleted after confirming that it held
no comments or timeline entries and that #542 was the canonical destination.

[Archived CAD pull requests](archived-pull-requests.tsv) lists 31 closed, unmerged PRs limited to the CAD paths.
Their records remain accessible to users with source repository triage access. GitHub refused archival of merged PRs.
Mixed PRs retain their source history and remain in the pull request index.
