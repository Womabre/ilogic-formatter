import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { format } from "../src/formatter";

// Fixtures live in the source tree, not in the compiled output — tsc only
// emits .js, so resolve them relative to the repo root.
const FIXTURE_DIR = path.join(__dirname, "..", "..", "test", "fixtures");

const INPUT_SUFFIX = ".input.iLogicVb";
const EXPECTED_SUFFIX = ".expected.iLogicVb";

/**
 * Characterization tests: each fixture pair pins the formatter's *current*
 * behavior so that changes elsewhere in the extension cannot alter it
 * unnoticed. A failing fixture is not automatically a bug — it means the
 * output changed, and the diff has to be reviewed deliberately.
 */
for (const entry of fs.readdirSync(FIXTURE_DIR).sort()) {
    if (!entry.endsWith(INPUT_SUFFIX)) continue;

    const name = entry.slice(0, -INPUT_SUFFIX.length);
    const expectedPath = path.join(FIXTURE_DIR, name + EXPECTED_SUFFIX);

    test(`fixture: ${name}`, () => {
        const input = fs.readFileSync(path.join(FIXTURE_DIR, entry), "utf8");
        const expected = fs.readFileSync(expectedPath, "utf8");
        assert.equal(format(input), expected);
    });
}

test("formatting is idempotent across every fixture", () => {
    for (const entry of fs.readdirSync(FIXTURE_DIR)) {
        if (!entry.endsWith(EXPECTED_SUFFIX)) continue;
        const expected = fs.readFileSync(path.join(FIXTURE_DIR, entry), "utf8");
        assert.equal(format(expected), expected, `not idempotent: ${entry}`);
    }
});

test("respects indentSize", () => {
    const input = "Sub Main\nDim x = 1\nEnd Sub\n";
    assert.equal(format(input, { indentSize: 2 }), "Sub Main\n  Dim x = 1\nEnd Sub\n");
});

test("respects useTabs", () => {
    const input = "Sub Main\nDim x = 1\nEnd Sub\n";
    assert.equal(format(input, { useTabs: true }), "Sub Main\n\tDim x = 1\nEnd Sub\n");
});

test("normalizeKeywords can be turned off", () => {
    const input = "dim x = 1\n";
    assert.equal(format(input, { normalizeKeywords: false }), "dim x = 1\n");
    assert.equal(format(input, { normalizeKeywords: true }), "Dim x = 1\n");
});

test("normalizeUnicode can be turned off", () => {
    const input = 'Dim s = “hello”\n';
    assert.equal(format(input, { normalizeUnicode: false }), 'Dim s = “hello”\n');
    assert.equal(format(input, { normalizeUnicode: true }), 'Dim s = "hello"\n');
});

test("keyword casing does not reach inside string literals", () => {
    const input = 'MessageBox.Show("do not touch dim or end here")\n';
    assert.equal(format(input), 'MessageBox.Show("do not touch dim or end here")\n');
});

test("comment normalization inserts a single space after the apostrophe", () => {
    assert.equal(format("'comment\n"), "' comment\n");
    assert.equal(format("' comment\n"), "' comment\n");
    assert.equal(format("'' banner\n"), "'' banner\n");
});

test("maxBlankLines collapses runs of blank lines", () => {
    const input = "Dim a = 1\n\n\n\n\nDim b = 2\n";
    assert.equal(format(input, { maxBlankLines: 1 }), "Dim a = 1\n\nDim b = 2\n");
    assert.equal(format(input, { maxBlankLines: 2 }), "Dim a = 1\n\n\nDim b = 2\n");
});
