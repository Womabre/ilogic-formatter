# Releasing

The extension is published as `Womabre.ilogic-formatter` in three places:

| Where | Who uses it | How it gets there |
| --- | --- | --- |
| GitHub releases | anyone installing a `.vsix` by hand | automatically, on a version tag |
| [Open VSX](https://open-vsx.org/extension/Womabre/ilogic-formatter) | VSCodium, Cursor, Gitpod, ... | automatically, on a version tag (trusted publishing) |
| [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Womabre.ilogic-formatter) | VS Code | automatically, on a version tag (trusted publishing) |

> [!WARNING]
> Installed copies update automatically. Read the changelog entries since the last release with that in mind: anything under **Changed** reaches every user on their next restart.

## Every release

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section, and set the same version in `package.json`.
2. Check locally:

   ```bash
   bun run typecheck && bun run compile && bun test && bunx vsce package
   ```

3. Commit and push, then tag and push the tag:

   ```bash
   git push ilogic-formatter main
   git tag v1.2.3
   git push ilogic-formatter v1.2.3
   ```

   The release workflow (`.github/workflows/release.yml`) runs two jobs. `build` refuses a tag that does not match `package.json`, type-checks, runs the tests and packages the `.vsix`. `publish` takes that `.vsix`, creates a GitHub release with it attached, and publishes it to Open VSX and then the VS Code Marketplace.

   Only `publish` holds the publishing rights, and it runs no code from the repository: nothing that runs during install, build or test can reach them.

## How trusted publishing is set up

The workflow publishes with `ovsx publish --trusted-publishing`: GitHub gives the job a short-lived OIDC token, and Open VSX accepts it because this repository and workflow are registered as a trusted publisher. No access token is stored anywhere.

- Namespace: `Womabre` (verified, owned by the `Womabre` GitHub account). It must match `publisher` in `package.json` exactly, including the capital W.
- Trusted publisher, under Settings > Trusted Publishers on open-vsx.org: organization `Womabre`, repository `ilogic-formatter`, workflow `release.yml`, no environment.
- The workflow needs `permissions: id-token: write`, and must not be given an Open VSX token: a token takes precedence over trusted publishing.

The Marketplace step works the same way with `vsce publish --oidc` (vsce 4.1.0 or later).

`ovsx` and `vsce` are dev dependencies with exact versions, locked in `bun.lock`, and the workflow runs them with `bunx --no-install`: a release never downloads a tool that is not in the lockfile. The GitHub Actions it uses are pinned to a commit. To update either, change the version (or the commit and the version comment behind it) in a normal commit, so the change is reviewed like any other.

- Trusted publisher, on the [publisher management page](https://marketplace.visualstudio.com/manage/publishers/Womabre): provider GitHub Actions, owner `Womabre`, repository `ilogic-formatter`, workflow `release.yml`.
- No `VSCE_PAT` secret: the workflow must not be given a Marketplace token.

If a publish step is refused:

- **Version already exists.** Both registries accept each version once. The GitHub release is still created; bump the version for a new release. If Open VSX succeeded and only the Marketplace failed, upload the `.vsix` from the GitHub release by hand (below) rather than re-tagging.
- **Not authorized.** Check that the registration still matches: renaming `release.yml` or the repository needs a new registration.

## The command line tool on npm (not set up yet)

The repository is ready to publish `ilogic-format` as the npm package `ilogic-formatter`: `.npmignore` limits the package to the compiled formatter, README, licence and changelog (`bun pm pack --dry-run` lists it), and `bin` points at `out/cli.js`. Nothing publishes it yet. To start:

1. On npmjs.com, create the package with a first manual `npm publish` (after `bun run compile`), then add this repository and `release.yml` as its Trusted Publisher.
2. Add a step to the `publish` job that runs `npm publish --provenance` on the checked-out, compiled source. Without step 1 that step fails and would stop the release, which is why it is not in the workflow.

## Publishing by hand

If the workflow cannot be used, both registries also take a `.vsix` directly:

```bash
bun run package
bunx ovsx publish ilogic-formatter.vsix --pat <open-vsx-access-token>
```

For the Marketplace, open the [publisher management page](https://marketplace.visualstudio.com/manage/publishers/Womabre), choose **...** > **Update** next to iLogic Formatter, and upload the same file.
