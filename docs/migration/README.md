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
- **NOT_RUN** for GitHub checks, wiki migration, individual issue transfer, and historical pull request indexing.
  D1274 remains an uncommitted change in the original development worktree.

## GitHub history

The existing source repository includes 2,164 issues and 455 pull requests. There were zero open PRs at the inventory checkpoint.
Use the [original issues](https://github.com/barocss/barocss/issues),
[original pull requests](https://github.com/barocss/barocss/pulls?q=is%3Apr), and
[original wiki](https://github.com/barocss/barocss/wiki) until the migration index is complete.

- Transfer confirmed open CAD issues using GitHub's native transfer. Review labels, milestones and cross-repository links first.
- Preserve original state, links and timeline for closed issues. GitHub documents native transfer for open issues.
- Index CAD PRs with their original URL and mapped commits. GitHub cannot retarget a PR to a different base repository.
  The original PR holds its review, comment and check records.
- Migrate CAD wiki material with its history and links. Keep mixed pages linked to their source.
