# Releasing

The extension is published as `Womabre.ilogic-formatter` on the VS Code Marketplace. Releases are cut by pushing a version tag; `.github/workflows/release.yml` does the rest.

## Every release

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section, and set the same version in `package.json` (and `package-lock.json`).
2. Check locally:

   ```bash
   bun run compile && bun test && bunx vsce package
   ```

3. Commit, then tag and push:

   ```bash
   git tag v1.2.3
   git push ilogic-formatter main --tags
   ```

The release workflow refuses a tag that does not match `package.json`, runs the tests, packages the `.vsix`, creates a GitHub release with the `.vsix` attached, and publishes to:

- the **VS Code Marketplace** when the repository secret `VSCE_PAT` is set,
- **Open VSX** (VSCodium, Cursor, Gitpod, ...) when `OVSX_PAT` is set.

Without a secret its publish step is skipped, so you can tag first and add tokens later.

> [!WARNING]
> Installed copies update automatically. Read the changelog entries since the last published version with that in mind: anything under **Changed** reaches every user on their next restart.

## One-time setup

### VS Code Marketplace (`VSCE_PAT`)

1. In Azure DevOps (`dev.azure.com`), create a Personal Access Token with organization **All accessible organizations** and scope **Marketplace > Manage**.
2. Add it to the GitHub repository as the secret `VSCE_PAT` (Settings > Secrets and variables > Actions).

### Open VSX (`OVSX_PAT`)

1. Sign in at `open-vsx.org` with GitHub, sign the publisher agreement, and create an access token.
2. Create the namespace once, matching the `publisher` in `package.json`:

   ```bash
   bunx ovsx create-namespace Womabre --pat <token>
   ```

3. Add the token as the secret `OVSX_PAT`.

## Publishing by hand

```bash
bunx vsce package
bunx vsce publish --packagePath ilogic-formatter-x.y.z.vsix
bunx ovsx publish ilogic-formatter-x.y.z.vsix --pat <token>
```
