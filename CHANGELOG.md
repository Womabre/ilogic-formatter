# Changelog

All notable changes to this extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.1] - 2026-10-03

### Fixed

- Format Selection and format on paste keep the surrounding indentation. Before, the selection was formatted as if it were a whole file, so lines inside a `Sub` went back to column 0, and a stray newline was added when the selection ended mid-line. The selected lines are now formatted with the block and blank-line state of the whole document, and lines outside the selection never change.

## [1.1.0] - 2026-10-03

### Added

- Line tokenizer (`src/tokenizer.ts`) that splits each line into code, string and comment tokens. Every formatter rule now reads these tokens instead of running its own quote scanner.
- Support for interpolated strings (`$"..."`, including holes with nested strings), VB 14 multi-line strings, and `REM` comments.
- Curly and fullwidth quotes (`“ ” ＂`, `‘ ’ ＇`) are recognised as string delimiters and comment markers, matching the VB compiler.
- `ilogicFormatter.formatVbFiles` setting (default `true`) to stop formatting `.vb` files.
- Golden-file test suite under `test/fixtures` (run with `bun test`), including todo fixtures for known indentation bugs.

### Fixed

- Unicode normalization no longer changes string literals. `"Pipe 1/2″"` used to become `"Pipe 1/2""`, a compile error, and `m²` became `m^2`.
- An `If` whose condition contains a string with the word "then" (e.g. `If s = "then what" Then`) is no longer read as a single-line `If`.
- Keyword casing no longer changes strings inside interpolated-string holes. `$"{d("date")}"` used to become `$"{d("Date")}"`, which changed the dictionary key.
- Lines inside a multi-line string are no longer trimmed, re-indented or collapsed as blank lines.
- `REM` comment text is no longer keyword-cased.

### Changed

- Unicode normalization no longer changes comment text, because comments cannot cause compile errors. Comment markers (`‘`) are still converted to `'`.

## [1.0.0] - 2026-05-15

### Added

- Initial release: indentation, keyword casing, blank-line normalization, comment spacing, Unicode lookalike replacement, and a TextMate grammar for `.iLogicVb` files.
