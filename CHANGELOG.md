# Changelog

All notable changes to this extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.1] - 2026-10-03

### Fixed

- Lines with several `:`-separated statements are split, so `Try : x = 1 : Catch : End Try` and `Catch : End Try` no longer leave a `Try` block open, and `For ... : Next` and `Dim x = 1 : If y Then` are handled. Colons in named arguments (`a:=1`), date literals (`#12:00#`) and directives are not separators.
- An `If` whose `Then` is on a continuation line (`If a OrElse _` / `b Then Return x`) is classified on the whole statement, so a single-line `If` no longer opens a block.
- VBA-style `Set x = ...` no longer opens a property `Set` block. `Get` and `Set` open a block only as property accessors.
- Escaped identifiers (`[Property]`, `[Date]`) are no longer read as keywords, and their casing is left as written.
- The lookahead that decides whether a `Property` has a body now skips comment lines. Before, a comment starting with "get" made a property look like a block, and a comment block above `Get` made a block property look like an auto-property.
- Formatting an empty or all-blank document leaves it empty instead of adding a newline, matching Format Selection.

## [1.2.0] - 2026-10-03

### Added

- Continuation lines get one extra indent level: lines after an explicit ` _`, and implicit continuations after a comma, an open bracket, an operator (`&`, `+`, `=`, ...) or a logical keyword (`AndAlso`, `OrElse`, ...). A continued block header (e.g. `If a AndAlso` / `b Then`) indents its continuation one level past the body, as wrapped parameter lists already did.
- Multi-line lambdas (`Function(x)` / `Sub(s, e)` with the body on the next lines) indent their body, including lambdas passed as arguments (`list.ForEach(Sub(x)` ... `End Sub)`), lambdas after `AddHandler x,` and nested lambdas. No blank line is added after a lambda's `End Function` / `End Sub`.
- Keyword casing covers every reserved VB keyword (`Public`, `Private`, `Of`, `ReDim`, `Call`, `AddressOf`, `NameOf`, `CShort`, ...) plus the unreserved `Preserve`, `Async`, `Await`, `Iterator`, `Yield`, `Off`, `Ansi`, `Unicode`. Unreserved words that are often variable names (`Key`, `Text`, `From`, `Where`, ...) are left alone.

### Fixed

- A continuation line is never read as the start of a statement. `If(a, b, c)` on a continuation line no longer opens an `If` block, a LINQ `Select` no longer opens a `Select Case`, and a single-line `Sub(x) ...` lambda no longer opens a `Sub`. Each of these used to shift the rest of the file one level right.
- An attribute line ending in `_` (`<Serializable> _`) is followed by the real statement, which is classified and indented normally.
- Lines that can only start a statement (`End If`, `Next`, `Else`, `Dim`, `If ... Then`, `Return`, ...) reset a paren count left open by unbalanced code, so one bad line cannot shift the rest of the file.
- A comment-only line ends a pending `_` continuation, like a blank line does.

## [1.1.2] - 2026-10-03

### Fixed

- Member signatures inside an `Interface` (`Sub`, `Function`, `Property`) no longer open a block. Before, every member indented the next line further, and everything after the interface drifted right. Nested types inside an interface are still indented.
- `MustOverride` members no longer open a block that never closes.
- `MustInherit`, `NotInheritable`, `Overloads`, `WriteOnly`, `Default`, `Widening` and `Narrowing` are recognised as modifiers, so `MustInherit Class`, `Friend NotInheritable Class`, `WriteOnly Property` and the like indent their body.

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
