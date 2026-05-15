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
# Press F5 in VS Code to launch Extension Development Host
```

## Notes

- iLogic rules use a VB.NET dialect with Inventor-specific globals (`iProperties`, `Parameter`, etc.) — these are treated as identifiers and their casing is left unchanged
- Single-line `If x Then DoSomething` is detected and not indented
- `ElseIf`, `Else`, `Catch`, `Finally` correctly dedent then re-indent
