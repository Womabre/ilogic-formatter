# iLogic Formatter

A VS Code extension that formats Autodesk Inventor iLogic rules (`.iLogicVb` files).

## Features

- **Indentation** — Correctly indents `If/End If`, `For/Next`, `Sub/End Sub`, `Function/End Function`, `With/End With`, `Select Case/End Select`, `Try/Catch/End Try`, and all other VB.NET block structures
- **Keyword casing** — Normalizes VB.NET keywords to their canonical casing (`dim` → `Dim`, `if` → `If`, `integer` → `Integer`, etc.)
- **Blank line normalization** — Collapses multiple consecutive blank lines and optionally inserts a blank line after `End Sub` / `End Function`
- **Comment formatting** — Ensures a space after the comment apostrophe (`'comment` → `' comment`)
- **Indent as you type** — Enter formats the finished line and puts the cursor at the right indent for the next one (`.iLogicVb` files; uses `editor.formatOnType`)
- **Convention hints** — flags `$"..."` strings, empty `Catch` blocks, `MsgBox` used for messages and a missing `Option Strict On` in `.iLogicVb` files, with quick fixes
- **iLogic objects** — completion, hover and highlighting for `ThisDoc`, `Logger`, `iProperties`, `Parameter`, `SharedVariable`, `GoExcel` and the other predefined iLogic objects, with links to the Autodesk iLogic API reference
- **Snippets** — `rule`, `app`, `sub`, `func`, `try`, `log`, `guard`, `region`, `iprop`, `facearea`: iLogic patterns with Option Strict, the ThisServer fallback, XML doc comments and Logger instead of MsgBox
- **Outline and folding** — Subs, Functions, Properties and types in the Outline view, breadcrumbs and Go to Symbol; folding for every block, `Case`/`Else` section, `#Region`, comment run and `Imports` run
- **Block warnings** — flags `End If` without `If`, a `Sub` or `If` that is never closed, and `Else`/`Case`/`Catch` outside their block, as you type
- **Syntax highlighting** — keywords, types, constants, strings, comments and numbers in `.iLogicVb` files. The keyword lists are generated from the same list the formatter uses for casing (`bun run grammar`)

## Usage

The formatter hooks into VS Code's standard formatting commands:

- **Format Document**: `Shift+Alt+F`
- **Format Selection**: `Ctrl+K Ctrl+F` (keeps the indentation of the surrounding code; also used by `editor.formatOnPaste`)
- **Format on Save**: enable via `editor.formatOnSave` in settings

## Configuration

All settings are under `ilogicFormatter.*` in VS Code settings:

| Setting               | Default | Description                       |
| --------------------- | ------- | --------------------------------- |
| `indentSize`          | `null`  | Spaces per indent level; `null` follows the editor's Tab Size |
| `useTabs`             | `null`  | Tabs instead of spaces; `null` follows the editor's Insert Spaces |
| `maxBlankLines`       | `1`     | Maximum consecutive blank lines   |
| `blankLineAfterBlock` | `true`  | Blank line after End Sub/Function |
| `normalizeKeywords`   | `true`  | Normalize VB keyword casing       |
| `normalizeComments`   | `true`  | Space after comment apostrophe    |
| `normalizeUnicode`    | `true`  | ASCII for lookalike characters in code (strings and comments untouched) |
| `formatVbFiles`       | `true`  | Also format `.vb` files           |
| `warnUnbalancedBlocks` | `true` | Warnings for unbalanced blocks |
| `disabledHints`       | `[]`    | Convention hints to turn off: `interpolation`, `empty-catch`, `msgbox`, `option-strict` |

Example `settings.json`:

```json
{
  "editor.formatOnSave": true,
  "[ilogicvb]": {
    "editor.defaultFormatter": "womabre.ilogic-formatter"
  },
  "ilogicFormatter.indentSize": 4,
  "ilogicFormatter.normalizeKeywords": true
}
```

## Command line

The same formatter, block checks and convention hints run outside VS Code with `ilogic-format`:

```bash
bun src/cli.ts --check --lint rules/
```

| Option | Does |
| --- | --- |
| *(none)* | Print the formatted rule (one file) |
| `--check` | List files that are not formatted; exit 1 if any |
| `--write` | Format in place, keeping CRLF line endings and the BOM |
| `--lint` | Report unbalanced blocks and convention hints; exit 1 if any |
| `--stdin` | Read a rule from stdin |
| `--json` | Machine-readable output |
| `--include-vb` | Also pick up `*.vb` files in directories |

Formatting flags mirror the settings (`--indent-size N`, `--use-tabs`, `--no-normalize-keywords`, ...); `--help` lists them all. Exit codes: 0 all good, 1 findings, 2 usage or file error.

As a git pre-commit hook (`.git/hooks/pre-commit`) that fails the commit when a staged rule is not formatted:

```bash
#!/bin/sh
# One file per line, so rule names with spaces work
git diff --cached --name-only --diff-filter=ACM | grep -i '\.ilogicvb$' | {
    status=0
    while IFS= read -r file; do
        bun /path/to/ilogic-formatter/src/cli.ts --check "$file" || status=1
    done
    exit $status
}
```

## Installation

### From VSIX (recommended)

1. Run `npm install` then `npm run package` to build the `.vsix` file
2. In VS Code: `Extensions` → `...` → `Install from VSIX`

### Development

```bash
npm install
npm run compile
bun test
# Press F5 in VS Code to launch Extension Development Host
```

### Testing in VS Code

Open this folder in VS Code and press <kbd>F5</kbd>. It compiles the extension and opens a second window (the Extension Development Host) on `sample/`, with only this extension loaded. Then check:

1. **Format Document:** open `Sample Rule.iLogicVb` and press <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd>.
   - Keywords are cased: `Option Strict On`, `Sub main()`, `List(Of String)`.
   - The string `"Pipe 1/2″ – " & area & " m²"` is unchanged.
   - `Try : DoWork(area) : Catch : End Try` stays on one line, at the `Case Else` body level.
   - The `Sub(p)` lambda body is indented, and `End Sub)` lines up with `parts.ForEach`.
   - The `_` and `AndAlso` continuation lines are indented one extra level.
   - `<DebuggerStepThrough()> Private Sub DoWork` indents its body.
2. **Format Selection:** undo, select the lines between `Sub main()` and `End Sub`, and press <kbd>Ctrl</kbd>+<kbd>K</kbd> <kbd>Ctrl</kbd>+<kbd>F</kbd>. The lines get the indentation of the code around them, and nothing outside the selection changes.
3. **Format on paste:** paste a few unindented lines inside `DoWork`. They land at the body indentation.
4. **Block warnings:** open `Unbalanced Rule.iLogicVb`. The Problems panel shows two warnings: the `If` on line 6 is not closed before `End Sub`, and the `End If` on line 13 has no `If`. Fix them and the warnings go away.
5. **Indent as you type:** in a new line inside `Sub main`, type `if x then` and press Enter. The line becomes `If x Then` and the cursor lands one level deeper. Type `end if` and press Enter: it becomes `End If` at the `If` level.
6. **Outline and folding:** the Outline view lists `main` and `DoWork`. The fold arrows next to `Select Case`, each `Case`, and the `Sub(p)` lambda fold those blocks.
7. **iLogic objects:** type `Logger.` in `Sub main`: the six log levels are offered. Hover `iProperties` for its description and reference link.
8. **Convention hints:** the one-line `Try : DoWork(area) : Catch : End Try` in `Sample Rule.iLogicVb` is flagged as an empty Catch. In `Unbalanced Rule.iLogicVb`, the missing `Option Strict On` is flagged on line 1; its light bulb offers to add it.
9. **`.vb` opt-out:** `Sample.vb` formats by default. Set `ilogicFormatter.formatVbFiles` to `false` and Format Document no longer offers this formatter for it.

## Notes

- iLogic rules use a VB.NET dialect with Inventor-specific globals (`iProperties`, `Parameter`, etc.) — these are treated as identifiers and their casing is left unchanged
- Single-line `If x Then DoSomething` is detected and not indented
- Continuation lines (after ` _`, a comma, an operator or an open bracket) are indented one extra level; multi-line lambdas indent their body
- `ElseIf`, `Else`, `Catch`, `Finally` correctly dedent then re-indent
- String literals and comments are never changed: keyword casing and Unicode replacement only touch code
- Formatter tests live in `test/fixtures/<name>/` as `input.iLogicVb` + `expected.iLogicVb`; a `todo.md` marks a known bug
