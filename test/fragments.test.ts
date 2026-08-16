import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFragments, toSnippets, toMemberTable, stripPlaceholders } from "../scripts/fragments";

const DOC = `# Title

Prose that is not a fragment.

## Excel

### Find a row by column value
\`goexcel-findrow\` — Search a worksheet for the first row matching a condition.

\`\`\`vb
i = GoExcel.FindRow("\${1:filename.xls}", "\${2:Sheet1}")
\`\`\`

### Read a single cell
\`goexcel-cellvalue\` — Read one cell.

\`\`\`vb
\${1:value} = GoExcel.CellValue("\${2:filename.xls}")
\`\`\`

## Parameters

### Set a parameter
\`param-set\` — Write a value to a model parameter.

\`\`\`vb
Parameter("\${1:d0}") = \${2:1.2}
\`\`\`
`;

test("parses every fragment in the document", () => {
    const fragments = parseFragments(DOC);
    assert.equal(fragments.length, 3);
});

test("captures name, prefix, description, category and body", () => {
    const [first] = parseFragments(DOC);
    assert.equal(first.name, "Find a row by column value");
    assert.equal(first.prefix, "goexcel-findrow");
    assert.equal(first.description, "Search a worksheet for the first row matching a condition.");
    assert.equal(first.category, "Excel");
    assert.equal(first.body, 'i = GoExcel.FindRow("${1:filename.xls}", "${2:Sheet1}")');
});

test("ignores prose outside fragments", () => {
    const fragments = parseFragments("# Title\n\nJust prose.\n\n## Empty category\n");
    assert.deepEqual(fragments, []);
});

test("does not treat a fenced example inside the format section as a fragment", () => {
    // A ````markdown fence containing a ```vb fence must not be parsed.
    const doc = "## Format\n\n````markdown\n### Not a fragment\n`nope` — no.\n\n```vb\nx = 1\n```\n````\n";
    assert.deepEqual(parseFragments(doc), []);
});

test("rejects a fragment missing its prefix line", () => {
    const doc = "## Excel\n\n### No prefix here\n\n```vb\nx = 1\n```\n";
    assert.throws(() => parseFragments(doc), /prefix/i);
});

test("rejects a fragment missing its code fence", () => {
    const doc = "## Excel\n\n### No body\n`nobody` — nothing follows.\n";
    assert.throws(() => parseFragments(doc), /body/i);
});

test("rejects duplicate prefixes", () => {
    const doc = DOC + "\n### Another\n`goexcel-findrow` — clash.\n\n```vb\nx = 1\n```\n";
    assert.throws(() => parseFragments(doc), /duplicate/i);
});

test("builds a VS Code snippet file keyed by fragment name", () => {
    const snippets = toSnippets(parseFragments(DOC));
    const entry = snippets["Find a row by column value"];
    assert.equal(entry.prefix, "goexcel-findrow");
    assert.equal(entry.description, "Search a worksheet for the first row matching a condition.");
    assert.deepEqual(entry.body, ['i = GoExcel.FindRow("${1:filename.xls}", "${2:Sheet1}")']);
});

test("splits multi-line bodies into a body array", () => {
    const doc = "## C\n\n### Two lines\n`two` — d.\n\n```vb\nDim a = 1\nDim b = 2\n```\n";
    const snippets = toSnippets(parseFragments(doc));
    assert.deepEqual(snippets["Two lines"].body, ["Dim a = 1", "Dim b = 2"]);
});

test("strips snippet placeholders down to their default text", () => {
    assert.equal(stripPlaceholders('GoExcel.CellValue("${1:file.xls}")'), 'GoExcel.CellValue("file.xls")');
    assert.equal(stripPlaceholders("Dim x = ${1|Double,Integer|}"), "Dim x = Double");
    assert.equal(stripPlaceholders("$0"), "");
    assert.equal(stripPlaceholders("${1:a} and ${2:b}"), "a and b");
});

test("collects members per API root, sorted and deduplicated", () => {
    const table = toMemberTable(parseFragments(DOC));
    assert.deepEqual(table["GoExcel"], [
        { name: "CellValue", kind: "method" },
        { name: "FindRow", kind: "method" },
    ]);
});

test("reports a member never called with arguments as a property", () => {
    const doc = "## C\n\n### Options\n`opt` — d.\n\n```vb\nGoExcel.TitleRow = 1\nGoExcel.Save\n```\n";
    assert.deepEqual(toMemberTable(parseFragments(doc))["GoExcel"], [
        { name: "Save", kind: "property" },
        { name: "TitleRow", kind: "property" },
    ]);
});

test("one call with parentheses is enough to report a member as a method", () => {
    const doc = "## C\n\n### Mixed\n`mix` — d.\n\n```vb\nGoExcel.Open(\"f.xls\")\nGoExcel.Open\n```\n";
    assert.deepEqual(toMemberTable(parseFragments(doc))["GoExcel"], [{ name: "Open", kind: "method" }]);
});

test("ignores members of roots that are not iLogic API roots", () => {
    const doc = "## C\n\n### Local\n`local` — d.\n\n```vb\nDim s = myLocalVariable.Trim()\n```\n";
    const table = toMemberTable(parseFragments(doc));
    assert.deepEqual(Object.keys(table), []);
});

test("does not collect members from inside string literals", () => {
    const doc = '## C\n\n### Str\n`str` — d.\n\n```vb\nMessageBox.Show("GoExcel.NotAMember")\n```\n';
    const table = toMemberTable(parseFragments(doc));
    assert.equal(table["GoExcel"], undefined);
});
