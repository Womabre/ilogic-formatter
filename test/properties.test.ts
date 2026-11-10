// Property-style tests: hundreds of generated rules, checked against what must
// hold for any input, however broken. The generator is seeded, so a failure
// names a seed that reproduces it.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { analyzeBlocks, format, FormatOptions, formatRange } from "../src/formatter";
import { lint } from "../src/lint";
import { foldingRanges, outline } from "../src/structure";

/** Small seeded generator (mulberry32). */
function random(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Every line of every fixture and sample: real VB, in every shape the formatter knows
const root = join(import.meta.dir, "..");
const corpus = [
    ...readdirSync(join(root, "test", "fixtures")).map((name) => join(root, "test", "fixtures", name, "input.iLogicVb")),
    ...readdirSync(join(root, "sample")).filter((f) => /vb$/i.test(f)).map((f) => join(root, "sample", f)),
].flatMap((path) => readFileSync(path, "utf8").split(/\r?\n/));

/** A rule of 5-60 lines drawn at random: blocks rarely balance, strings may stay open. */
function generate(seed: number): string {
    const next = random(seed);
    const pick = () => corpus[Math.floor(next() * corpus.length)];
    const indent = () => " ".repeat(Math.floor(next() * 9));
    const count = 5 + Math.floor(next() * 56);
    return Array.from({ length: count }, () => (next() < 0.1 ? "" : next() < 0.5 ? indent() + pick().trim() : pick())).join("\n") + "\n";
}

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
const AS_WRITTEN: FormatOptions = { normalizeKeywords: false, normalizeComments: false, normalizeUnicode: false };
const failing = (check: (text: string, seed: number) => boolean) => SEEDS.filter((seed) => !check(generate(seed), seed));

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

    test("block analysis, folding, the outline and the hints never throw, and stay inside the text", () => {
        expect(failing((text) => {
            const lines = text.split("\n").length;
            const inside = (n: number) => Number.isInteger(n) && n >= 0 && n < lines;
            const { problems, spans } = analyzeBlocks(text);
            return problems.every((p) => inside(p.line)) && spans.every((s) => inside(s.start) && inside(s.end) && s.start <= s.end) &&
                foldingRanges(text).every((r) => inside(r.start) && inside(r.end) && r.start < r.end) &&
                lint(text).every((p) => inside(p.line) && p.start >= 0 && p.end >= p.start) &&
                Array.isArray(outline(text));
        })).toEqual([]);
    });
});
