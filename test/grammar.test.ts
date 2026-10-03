import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { GRAMMAR_PATH, grammarText } from "../scripts/build-grammar";
import { VB_KEYWORDS } from "../src/keywords";

test("the committed grammar is generated from src/keywords.ts (run: bun run grammar)", () => {
    expect(readFileSync(GRAMMAR_PATH, "utf8")).toBe(grammarText());
});

test("every keyword the formatter cases is highlighted", () => {
    const grammar = readFileSync(GRAMMAR_PATH, "utf8").toLowerCase();
    const words = Object.entries(VB_KEYWORDS)
        .filter(([key, canonical]) => key === canonical.toLowerCase()) // skip legacy spellings like "endif"
        .map(([key]) => key);
    const missing = words.filter((w) => !new RegExp("[(|]" + w + "[|)]").test(grammar));
    expect(missing).toEqual([]);
});
