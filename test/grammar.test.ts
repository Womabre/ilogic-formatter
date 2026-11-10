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

// ── What the grammar actually highlights, through VS Code's own TextMate engine ──
import { describe } from "bun:test";
import { join } from "path";
import { INITIAL, parseRawGrammar, Registry } from "vscode-textmate";
import { createOnigScanner, createOnigString, loadWASM } from "vscode-oniguruma";

const wasm = readFileSync(join(import.meta.dir, "..", "node_modules", "vscode-oniguruma", "release", "onig.wasm"));
await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
const registry = new Registry({
    onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
    loadGrammar: async () => parseRawGrammar(grammarText(), GRAMMAR_PATH),
});
const grammar = (await registry.loadGrammar("source.ilogicvb"))!;

/** [text, innermost scope] for every token on the lines, skipping whitespace and unscoped text. */
function scopes(...lines: string[]): [string, string][] {
    const result: [string, string][] = [];
    let stack = INITIAL;
    for (const line of lines) {
        const tokenized = grammar.tokenizeLine(line, stack);
        stack = tokenized.ruleStack;
        const lineTokens: [string, string, number][] = [];
        for (const t of tokenized.tokens) {
            const text = line.slice(t.startIndex, t.endIndex);
            const scope = t.scopes[t.scopes.length - 1].replace(/\.ilogicvb$/, "");
            if (scope === "source") continue;
            // The engine reports a string's opening and closing quote separately: join same-scope neighbours
            const previous = lineTokens[lineTokens.length - 1];
            if (previous && previous[1] === scope && previous[2] === t.startIndex) {
                previous[0] += text;
                previous[2] = t.endIndex;
            } else lineTokens.push([text, scope, t.endIndex]);
        }
        result.push(...lineTokens.filter(([text]) => text.trim() !== "").map(([text, scope]) => [text, scope] as [string, string]));
    }
    return result;
}

describe("grammar highlighting", () => {
    test("apostrophe and REM comments; REM only at the start of a statement", () => {
        expect(scopes("x = 1 ' note")).toContainEqual(["' note", "comment.line.apostrophe"]);
        expect(scopes("REM whole line")).toEqual([["REM whole line", "comment.line.rem"]]);
        expect(scopes("x = 1 : rem after a colon").at(-1)).toEqual([" rem after a colon", "comment.line.rem"]);
        expect(scopes("remainder = 5").map(([, s]) => s)).not.toContain("comment.line.rem");
        expect(scopes("x = REMOTE").map(([, s]) => s)).not.toContain("comment.line.rem");
    });

    test("directives, with the rest of the line highlighted as code", () => {
        expect(scopes('#Region "Helpers"')).toEqual([["#Region", "keyword.control.directive"], ['"Helpers"', "string.quoted.double"]]);
        expect(scopes("  #If DEBUG Then")[0]).toEqual(["  #If", "keyword.control.directive"]);
        expect(scopes("#End Region")).toEqual([["#End Region", "keyword.control.directive"]]);
        expect(scopes("d = #1/1/2020#").map(([, s]) => s)).not.toContain("keyword.control.directive");
    });

    test("numbers: hex, octal, binary, decimals and type suffixes", () => {
        const numeric = (line: string) => scopes(line).filter(([, s]) => s.startsWith("constant.numeric"));
        expect(numeric("x = &HFF + &O17 + &B1010")).toEqual([["&HFF", "constant.numeric.hex"], ["&O17", "constant.numeric.octal"], ["&B1010", "constant.numeric.binary"]]);
        expect(numeric("y = 1.5E-3 + 10L + 2.5F + 1_000")).toEqual([["1.5E-3", "constant.numeric"], ["10L", "constant.numeric"], ["2.5F", "constant.numeric"], ["1_000", "constant.numeric"]]);
        expect(numeric('s = a & Hello & "x"')).toEqual([]);
    });

    test("interpolated strings: text is string, holes are code, doubled braces and quotes are escapes", () => {
        const tokens = scopes('s = $"Width {d0 * 2:N1} mm {{raw}} ""q"" {If(a, "y", "n")}"');
        expect(tokens).toContainEqual(['$"Width ', "string.quoted.double.interpolated"]);
        expect(tokens).toContainEqual(["{", "punctuation.section.interpolation.begin"]);
        expect(tokens).toContainEqual(["2", "constant.numeric"]);
        expect(tokens).toContainEqual(["{{", "constant.character.escape"]);
        expect(tokens).toContainEqual(['""', "constant.character.escape"]);
        expect(tokens).toContainEqual(["If", "keyword.control"]);
        expect(tokens).toContainEqual(['"y"', "string.quoted.double"]);
        expect(tokens.at(-1)).toEqual(['"', "string.quoted.double.interpolated"]);
    });

    test("strings: escapes, curly quotes, and nothing inside is code", () => {
        expect(scopes('s = "If ""x"" Then \' no"').slice(1)).toEqual([['"If ', "string.quoted.double"], ['""', "constant.character.escape"], ["x", "string.quoted.double"], ['""', "constant.character.escape"], [" Then ' no\"", "string.quoted.double"]]);
        expect(scopes("s = “curly”").at(-1)![1]).toBe("string.quoted.double");
        expect(scopes('a = "open', 'still" : b = 1').map(([t, s]) => [t, s])).toContainEqual(["1", "constant.numeric"]);
    });

    test("keywords and the predefined iLogic objects", () => {
        expect(scopes("If ThisDoc.Document Is Nothing Then")).toEqual([
            ["If", "keyword.control"], ["ThisDoc", "support.class"], [".", "keyword.operator"],
            ["Is", "keyword.operator.word"], ["Nothing", "constant.language"], ["Then", "keyword.control"],
        ]);
    });
});
