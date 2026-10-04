# Releasing

The extension is published as `Womabre.ilogic-formatter` in three places:

| Where | Who uses it | How it gets there |
| --- | --- | --- |
| GitHub releases | anyone installing a `.vsix` by hand | automatically, on a version tag |
| [Open VSX](https://open-vsx.org/extension/Womabre/ilogic-formatter) | VSCodium, Cursor, Gitpod, ... | automatically, on a version tag (trusted publishing) |
| [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Womabre.ilogic-formatter) | VS Code | by hand: upload the `.vsix` from the GitHub release |

> [!WARNING]
> Installed copies update automatically. Read the changelog entries since the last release with that in mind: anything under **Changed** reaches every user on their next restart.

## Every release

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section, and set the same version in `package.json` and `package-lock.json`.
2. Check locally:

   ```bash
   bun run compile && bun test && bunx vsce package
   ```

3. Commit and push, then tag and push the tag:

   ```bash
   git push ilogic-formatter main
   git tag v1.2.3
   git push ilogic-formatter v1.2.3
   ```

   The release workflow (`.github/workflows/release.yml`) refuses a tag that does not match `package.json`, runs the tests, packages the `.vsix`, creates a GitHub release with the `.vsix` attached, and publishes it to Open VSX.

4. Update the Marketplace: download `ilogic-formatter-x.y.z.vsix` from the GitHub release, open the [publisher management page](https://marketplace.visualstudio.com/manage/publishers/Womabre), choose **...** > **Update** next to iLogic Formatter, and upload the `.vsix`. This needs no token.

## How Open VSX publishing is set up

The workflow publishes with `ovsx publish --trusted-publishing`: GitHub gives the job a short-lived OIDC token, and Open VSX accepts it because this repository and workflow are registered as a trusted publisher. No access token is stored anywhere.

- Namespace: `Womabre` (verified, owned by the `Womabre` GitHub account). It must match `publisher` in `package.json` exactly, including the capital W.
- Trusted publisher, under Settings > Trusted Publishers on open-vsx.org: organization `Womabre`, repository `ilogic-formatter`, workflow `release.yml`, no environment.
- The workflow needs `permissions: id-token: write`, and must not be given an Open VSX token: a token takes precedence over trusted publishing.

If the Open VSX step is refused:

- **Version already exists.** Open VSX accepts each version once. The GitHub release is still created; bump the version for a new release.
- **Not authorized.** Check that the registration still matches: renaming `release.yml` or the repository needs a new registration.

## Publishing by hand

If the workflow cannot be used, both registries also take a `.vsix` directly:

```bash
bun run package
bunx ovsx@1.2.0 publish ilogic-formatter.vsix --pat <open-vsx-access-token>
```

For the Marketplace, upload the same file on the publisher management page as in step 4.
