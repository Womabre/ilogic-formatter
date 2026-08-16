# Commit the generated snippet and completion artifacts

`snippets/ilogic.code-snippets` and `src/generated/members.ts` are produced from
`data/ilogic-fragments.md` by `npm run generate`, and both are committed rather
than built at package time. The point of generating from a curated library is
that a change to a fragment is reviewable *before* it reaches users — which only
happens if the output appears in the diff. Building at publish time would hide
the blast radius of a fragment edit and would leave a fresh clone unable to run
the extension in the debugger without a build step first.

## Consequences

The generated files can go stale. `npm run verify` regenerates and then runs
`git diff --exit-code`, and the test suite compares the committed artifacts
against a fresh parse of the library, so staleness fails rather than ships.
