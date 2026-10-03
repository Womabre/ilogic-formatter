# iLogic Formatter

A VS Code extension that formats Autodesk Inventor iLogic rules (`.iLogicVb` files).

## Features

- **Indentation** — Correctly indents `If/End If`, `For/Next`, `Sub/End Sub`, `Function/End Function`, `With/End With`, `Select Case/End Select`, `Try/Catch/End Try`, and all other VB.NET block structures
- **Keyword casing** — Normalizes VB.NET keywords to their canonical casing (`dim` → `Dim`, `if` → `If`, `integer` → `Integer`, etc.)
- **Blank line normalization** — Collapses multiple consecutive blank lines and optionally inserts a blank line after `End Sub` / `End Function`
- **Comment formatting** — Ensures a space after the comment apostrophe (`'comment` → `' comment`)
- **Syntax highlighting** — Full TextMate grammar for `.iLogicVb` files

## Usage

The formatter hooks into VS Code's standard formatting commands:

- **Format Document**: `Shift+Alt+F`
- **Format Selection**: `Ctrl+K Ctrl+F` (keeps the indentation of the surrounding code; also used by `editor.formatOnPaste`)
- **Format on Save**: enable via `editor.formatOnSave` in settings

## Configuration

All settings are under `ilogicFormatter.*` in VS Code settings:

| Setting               | Default | Description                       |
| --------------------- | ------- | --------------------------------- |
| `indentSize`          | `4`     | Spaces per indent level           |
| `useTabs`             | `false` | Use tabs instead of spaces        |
| `maxBlankLines`       | `1`     | Maximum consecutive blank lines   |
| `blankLineAfterBlock` | `true`  | Blank line after End Sub/Function |
| `normalizeKeywords`   | `true`  | Normalize VB keyword casing       |
| `normalizeComments`   | `true`  | Space after comment apostrophe    |
| `normalizeUnicode`    | `true`  | ASCII for lookalike characters in code (strings and comments untouched) |
| `formatVbFiles`       | `true`  | Also format `.vb` files           |

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
4. **`.vb` opt-out:** `Sample.vb` formats by default. Set `ilogicFormatter.formatVbFiles` to `false` and Format Document no longer offers this formatter for it.

## Notes

- iLogic rules use a VB.NET dialect with Inventor-specific globals (`iProperties`, `Parameter`, etc.) — these are treated as identifiers and their casing is left unchanged
- Single-line `If x Then DoSomething` is detected and not indented
- Continuation lines (after ` _`, a comma, an operator or an open bracket) are indented one extra level; multi-line lambdas indent their body
- `ElseIf`, `Else`, `Catch`, `Finally` correctly dedent then re-indent
- String literals and comments are never changed: keyword casing and Unicode replacement only touch code
- Formatter tests live in `test/fixtures/<name>/` as `input.iLogicVb` + `expected.iLogicVb`; a `todo.md` marks a known bug
