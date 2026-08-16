import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseFragments, toSnippets, toMemberTable } from "../scripts/fragments";

const ROOT = path.join(__dirname, "..", "..");
const SOURCE = path.join(ROOT, "data", "ilogic-fragments.md");
const SNIPPETS = path.join(ROOT, "snippets", "ilogic.code-snippets");

const fragments = parseFragments(fs.readFileSync(SOURCE, "utf8"));

test("the fragment library parses and is not empty", () => {
    assert.ok(fragments.length > 0);
});

test("every fragment has a prefix, a description and a body", () => {
    for (const fragment of fragments) {
        assert.match(fragment.prefix, /^[a-z][a-z0-9-]*$/, `bad prefix on "${fragment.name}"`);
        assert.notEqual(fragment.description, "", `missing description on "${fragment.name}"`);
        assert.notEqual(fragment.body.trim(), "", `empty body on "${fragment.name}"`);
        assert.notEqual(fragment.category, "", `no category for "${fragment.name}"`);
    }
});

test("fragment names are unique", () => {
    const names = fragments.map((f) => f.name);
    assert.equal(new Set(names).size, names.length);
});

test("placeholder indices in a body start at 1 and have no gaps", () => {
    for (const fragment of fragments) {
        const indices = [...fragment.body.matchAll(/\$\{(\d+)[:|]/g)]
            .map((m) => Number(m[1]))
            .sort((a, b) => a - b);
        if (indices.length === 0) continue;
        const unique = [...new Set(indices)];
        assert.equal(unique[0], 1, `"${fragment.name}" does not start at $1`);
        for (let i = 1; i < unique.length; i++) {
            assert.equal(unique[i], unique[i - 1] + 1, `"${fragment.name}" skips a tab stop`);
        }
    }
});

test("bodies contain no lookalike Unicode that would break a rule", () => {
    // The formatter rewrites these; a shipped snippet must never insert them.
    const lookalikes = /[‐-―‘’“”„′″ ×÷≠≤≥]/;
    for (const fragment of fragments) {
        assert.doesNotMatch(fragment.body, lookalikes, `lookalike Unicode in "${fragment.name}"`);
    }
});

test("the committed snippet file matches the fragment library", () => {
    const committed = JSON.parse(fs.readFileSync(SNIPPETS, "utf8"));
    delete committed["//"];
    assert.deepEqual(committed, toSnippets(fragments), "snippets are stale — run npm run generate");
});

test("the committed member table matches the fragment library", async () => {
    const { MEMBERS } = await import("../src/generated/members");
    assert.deepEqual(
        JSON.parse(JSON.stringify(MEMBERS)),
        toMemberTable(fragments),
        "member table is stale — run npm run generate"
    );
});
