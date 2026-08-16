# Changelog

All notable changes to this extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Snippet pack: 71 curated iLogic fragments covering Excel access, parameters,
  components, drawings and rule invocation. Prefixes are named after the API
  root they use (`goexcel-findrow`, `param-set`, `thisdrawing-dim-linear`).
- Completions for iLogic API roots and their members in `.iLogicVb` files,
  switchable off with `ilogicFormatter.enableCompletions`.
- `data/ilogic-fragments.md` as the source of truth for both, with
  `npm run generate` deriving the snippet file and the completion member table.
- Test suite (`npm test`) covering the formatter, the fragment parser, the
  generated artifacts and the completion model. No new dependencies.

### Changed

- `ilogic-formatter.vsix` is no longer tracked in git; it was listed in
  `.gitignore` but had been committed.

## [1.0.0]

### Added

- Formatting for iLogic rules: indentation, keyword casing, blank line
  normalization, comment spacing and Unicode lookalike replacement.
- TextMate grammar for `.iLogicVb` files.
