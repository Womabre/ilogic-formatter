// Property-style tests: hundreds of generated rules, checked against what must
// hold for any input, however broken. The generator is seeded, so a failure
// names a seed that reproduces it.
import { describe, expect, test } from "bun:test";
import { analyzeBlocks, format, FormatOptions, formatRange } from "../src/formatter";
import { lint } from "../src/lint";
import { foldingRanges, outline } from "../src/structure";
import { INITIAL_STATE, LineState, scanLines, tokenizeLine } from "../src/tokenizer";
import { generate, generateWithStrings } from "./generate";

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
const AS_WRITTEN: FormatOptions = { normalizeKeywords: false, normalizeComments: false, normalizeUnicode: false };
// Each seed twice: the plain rule, and the same rule with multi-line strings whose closing line carries code ("s" + seed)
const failing = (check: (text: string) => boolean) => [
    ...SEEDS.filter((seed) => !check(generate(seed))),
    ...SEEDS.filter((seed) => !check(generateWithStrings(seed))).map((seed) => `s${seed}`),
];

describe("for any rule", () => {
    test("formatting twice gives the same result as formatting once", () => {
        expect(failing((text) => format(format(text)) === format(text))).toEqual([]);
        expect(failing((text) => format(format(text, AS_WRITTEN), AS_WRITTEN) === format(text, AS_WRITTEN))).toEqual([]);
    });

    test("with the normalizations off, formatting changes whitespace only", () => {
        const withoutWhitespace = (text: string) => text.replace(/\s+/g, "");
        expect(failing((text) => withoutWhitespace(format(text, AS_WRITTEN)) === withoutWhitespace(text))).toEqual([]);
    });

    test("no line of code or comment is added, dropped or joined", () => {
        const written = (text: string) => text.split("\n").filter((line) => line.trim() !== "").length;
        expect(failing((text) => written(format(text)) === written(text))).toEqual([]);
    });

    test("the result ends in one newline and has no trailing blank lines", () => {
        expect(failing((text) => /[^\n]\n$/.test(format(text)))).toEqual([]);
    });

    test("formatting the whole text as a range equals formatting the document", () => {
        expect(failing((text) => formatRange(text, 0, text.split("\n").length - 1) === format(text))).toEqual([]);
    });

    test("scanned lines: one per line, masked as wide as the line, string state carried from the line above", () => {
        expect(failing((text) => {
            const raws = text.split(/\r?\n/);
            const scanned = scanLines(text);
            let state: LineState = INITIAL_STATE;
            return scanned.length === raws.length && scanned.every((l, i) => {
                const startsInString = state.openString !== null;
                state = tokenizeLine(raws[i], state).endState;
                return l.raw === raws[i] && l.masked.length === l.raw.length && l.startsInString === startsInString &&
                    // A line that is all string continued from above has no code of its own
                    (!startsInString || l.tokens.length > 1 || l.code === "");
            });
        })).toEqual([]);
    });

    test("block analysis, folding, the outline and the hints never throw, and stay inside the text", () => {
        expect(failing((text) => {
            const lines = text.split("\n").length;
            const inside = (n: number) => Number.isInteger(n) && n >= 0 && n < lines;
            const { problems, spans } = analyzeBlocks(text);
            // Section lines lie inside their block, in order
            const ordered = (s: (typeof spans)[number]) =>
                [s.start, ...s.middles.map((m) => m.line), s.end].every((line, k, all) => k === 0 || all[k - 1] <= line);
            return problems.every((p) => inside(p.line)) && spans.every((s) => inside(s.start) && inside(s.end) && s.start <= s.end && ordered(s)) &&
                foldingRanges(text).every((r) => inside(r.start) && inside(r.end) && r.start < r.end) &&
                lint(text).every((p) => inside(p.line) && p.start >= 0 && p.end >= p.start) &&
                Array.isArray(outline(text));
        })).toEqual([]);
    });
});
