# iLogic Formatter

A VS Code extension for Autodesk Inventor iLogic rules: formatting, syntax
highlighting, snippets and completions.

## Language

### The language being edited

**Rule**:
A block of iLogic code stored in an Inventor document and run by Inventor. The
unit a user edits in this extension.
_Avoid_: script, macro (a macro is VBA, which is a different thing)

**iLogic**:
Autodesk's VB.NET dialect for Inventor rules, extended with globals such as
`Parameter`, `GoExcel` and `ThisDoc`.
_Avoid_: VBA, VB

**API root**:
An iLogic global that members are reached through — `GoExcel`, `ThisDoc`,
`Parameter`, `Component`. The unit completions are organised around.
_Avoid_: namespace, class, object

**Intent**:
A named handle onto model geometry (a face, edge or point) used to attach
drawing annotations without referring to geometry by index.

**Occurrence**:
One placement of a component in an assembly, named `Part1:1`. Addressed through
`MakePath` when nested.
_Avoid_: instance, part (a part is a file; an occurrence is its placement)

### The fragment library

**Fragment**:
One reusable piece of iLogic code with a name, a snippet prefix, a description
and a body. The unit of the library.
_Avoid_: snippet (a snippet is what a fragment becomes once generated), example

**Family**:
A group of related fragments within a category — "Finding rows", "Dimensions".
Exists for the reader of the library, not for the generator.

**Category**:
The API area a family sits in — Excel, Parameters, Drawings.

**Curated set**:
The fragments in `data/ilogic-fragments.md`: reviewed, English, core iLogic
only, and tracked in the repository.
_Avoid_: public set

**Private library**:
The maintainer's local working notes, which the curated set is drawn from.
Gitignored and never shipped.
_Avoid_: source file (ambiguous with the curated set, which is the generator's
source)

**Generated artifact**:
A file produced by `npm run generate` and committed —
`snippets/ilogic.code-snippets` and `src/generated/members.ts`. Never edited by
hand.

**Prefix**:
What a user types to expand a fragment, named after its API root:
`goexcel-findrow`, `param-set`.
_Avoid_: trigger, shortcut

**Member table**:
The mapping from each API root to the members observed on it in the curated
set. The entire basis of completions.
