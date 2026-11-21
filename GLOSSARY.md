# iLogic Formatter

Formats and checks iLogic rules (Inventor's VB.NET dialect) in VS Code and from the command line.

## Language

**Rule**:
One iLogic rule file: an `.iLogicVb` file, or a `.vb` file taken for one.
_Avoid_: script, document, file (when the iLogic meaning matters)

**Text as written**:
The rule's text exactly as it is on disk or in the editor, before any formatting or lookalike normalization; what the VB compiler sees.
_Avoid_: raw text, original

**Scanned line**:
One physical line of a rule, seen once with the string state carried from the lines above it: its code, its strings, its comment, and whether it starts inside a multi-line string.
_Avoid_: line info, tokenized line, logical line

**Block**:
A matched opener and closer (`Sub`…`End Sub`, `If`…`End If`, `#If`…`#End If`), with the `Else`/`Case`/`Catch` lines in between.

**Block analysis**:
The blocks of a rule and the problems with them (a closer without an opener, a block never closed), always taken from the text as written.
_Avoid_: block check

**Hint**:
A convention check on a rule (no string interpolation, no empty Catch, Option Strict On, ...), shown as a diagnostic with an optional quick fix.
_Avoid_: lint warning, convention diagnostic
