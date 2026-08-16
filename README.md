# iLogic Formatter

A VS Code extension that formats Autodesk Inventor iLogic rules (`.iLogicVb` files).

## Features

- **Indentation** — Correctly indents `If/End If`, `For/Next`, `Sub/End Sub`, `Function/End Function`, `With/End With`, `Select Case/End Select`, `Try/Catch/End Try`, and all other VB.NET block structures
- **Keyword casing** — Normalizes VB.NET keywords to their canonical casing (`dim` → `Dim`, `if` → `If`, `integer` → `Integer`, etc.)
- **Blank line normalization** — Collapses multiple consecutive blank lines and optionally inserts a blank line after `End Sub` / `End Function`
- **Comment formatting** — Ensures a space after the comment apostrophe (`'comment` → `' comment`)
- **Unicode cleanup** — Replaces lookalike characters that break compilation (curly quotes, en dashes, `≠`, `×`) with their ASCII equivalents
- **Syntax highlighting** — Full TextMate grammar for `.iLogicVb` files
- **Snippets** — 71 iLogic fragments for Excel access, parameters, components, drawings and rule invocation
- **Completions** — Suggests iLogic API roots (`GoExcel`, `ThisDoc`, `Parameter`, …) and their members

## Usage

The formatter hooks into VS Code's standard formatting commands:

- **Format Document**: `Shift+Alt+F`
- **Format on Save**: enable via `editor.formatOnSave` in settings

## Configuration

All settings are under `ilogicFormatter.*` in VS Code settings:

| Setting               | Default | Description                          |
| --------------------- | ------- | ------------------------------------ |
| `indentSize`          | `4`     | Spaces per indent level              |
| `useTabs`             | `false` | Use tabs instead of spaces           |
| `maxBlankLines`       | `1`     | Maximum consecutive blank lines      |
| `blankLineAfterBlock` | `true`  | Blank line after End Sub/Function    |
| `normalizeKeywords`   | `true`  | Normalize VB keyword casing          |
| `normalizeComments`   | `true`  | Space after comment apostrophe       |
| `normalizeUnicode`    | `true`  | Replace lookalike Unicode with ASCII |
| `enableCompletions`   | `true`  | Suggest iLogic API roots and members |

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
npm test
# Press F5 in VS Code to launch Extension Development Host
```

## The fragment library

Snippets and completions are both generated from a single source file,
[`data/ilogic-fragments.md`](data/ilogic-fragments.md). Each fragment is a
heading, a prefix, a description and a `vb` code fence — the file explains its
own format at the top.

To add or change a snippet, edit that file and regenerate:

```bash
npm run generate   # rewrites snippets/ and src/generated/
npm run verify     # compile, generate, test, and fail if anything is stale
```

The generated files are committed, so a change to the library shows up as a
diff in review. `npm run verify` fails if they are out of date.

Snippet prefixes are named after the API root they use, so the completion list
groups them: `goexcel-findrow`, `param-set`, `thisdrawing-dim-linear`,
`component-replace`.

Completions are one level deep by design — they offer the API roots and the
members of a single known root. iLogic exposes no type information, so
following a chain such as `ThisDrawing.Sheets.` would mean guessing at members
that may not exist.

## Notes

- iLogic rules use a VB.NET dialect with Inventor-specific globals (`iProperties`, `Parameter`, etc.) — these are treated as identifiers and their casing is left unchanged
- Single-line `If x Then DoSomething` is detected and not indented
- `ElseIf`, `Else`, `Catch`, `Finally` correctly dedent then re-indent
