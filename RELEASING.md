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
- **Open VSX** (VSCodium, Cursor, Gitpod, ...) by trusted publishing when the repository variable `PUBLISH_OPENVSX` is `true`. No token is stored: GitHub proves to Open VSX which repository and workflow is publishing.

A skipped publish step leaves the GitHub release in place, so you can tag first and finish the setup later.

> [!WARNING]
> Installed copies update automatically. Read the changelog entries since the last published version with that in mind: anything under **Changed** reaches every user on their next restart.

## One-time setup

### VS Code Marketplace (`VSCE_PAT`)

1. In Azure DevOps (`dev.azure.com`), create a Personal Access Token with organization **All accessible organizations** and scope **Marketplace > Manage**.
2. Add it to the GitHub repository as the secret `VSCE_PAT` (Settings > Secrets and variables > Actions).

### Open VSX (trusted publishing)

Trusted publishing only works for an extension that already has a version on Open VSX, in a namespace you own. So the first version is published by hand, once:

1. On `open-vsx.org`, signed in with GitHub: sign the **Publisher Agreement** and create an **Access Token** (both under Settings).
2. Create the namespace. It must match the `publisher` in `package.json` exactly, including the capital W:

   ```bash
   bunx ovsx@1.2.0 create-namespace Womabre --pat <token>
   ```

3. Publish the current build:

   ```bash
   bun run package
   bunx ovsx@1.2.0 publish ilogic-formatter.vsix --pat <token>
   ```

4. Register the trusted publisher on `open-vsx.org` under Settings > Trusted Publishers:
   - Organization or User name: `Womabre`
   - Repository name: `ilogic-formatter`
   - Workflow filename: `release.yml`
   - Environment name: leave empty
5. In the GitHub repository, add the variable `PUBLISH_OPENVSX` with value `true` (Settings > Secrets and variables > Actions > Variables). Open VSX refuses a version twice: if you tag the version you just published by hand, set this variable after that release has run.
6. Delete the access token from step 1; releases no longer need it.

From then on every version tag publishes to Open VSX without a token. If `publish --trusted-publishing` is refused, check that the four fields in step 4 match the repository and workflow file exactly.

## Publishing by hand

```bash
bunx vsce package
bunx vsce publish --packagePath ilogic-formatter-x.y.z.vsix
bunx ovsx@1.2.0 publish ilogic-formatter-x.y.z.vsix --pat <token>
```
