import { describe, expect, test } from "bun:test";
import { codeOnly, tokenizeLine } from "../src/tokenizer";

const kinds = (line: string) => tokenizeLine(line).tokens.map((t) => [t.kind, t.text]);

describe("tokenizeLine", () => {
    test("splits code, string and comment", () => {
        expect(kinds(`x = "a 'b" ' note`)).toEqual([
            ["code", "x = "],
            ["string", `"a 'b"`],
            ["code", " "],
            ["comment", "' note"],
        ]);
    });

    test("doubled quotes are escapes, not string ends", () => {
        expect(kinds(`s = "say ""hi"" now"`)).toEqual([
            ["code", "s = "],
            ["string", `"say ""hi"" now"`],
        ]);
    });

    test("curly and fullwidth quotes delimit strings and comments, like Roslyn", () => {
        expect(kinds("s = “abc” ‘ note")).toEqual([
            ["code", "s = "],
            ["string", "“abc”"],
            ["code", " "],
            ["comment", "‘ note"],
        ]);
        expect(kinds("s = ＂x＂")[1]).toEqual(["string", "＂x＂"]);
    });

    test("double prime is content, not a delimiter", () => {
        expect(kinds(`s = "1/2″ pipe"`)[1]).toEqual(["string", `"1/2″ pipe"`]);
    });

    test("interpolated strings include holes with nested strings", () => {
        expect(kinds(`s = $"{d("Date")} it's {{x}}" ' c`)).toEqual([
            ["code", "s = "],
            ["string", `$"{d("Date")} it's {{x}}"`],
            ["code", " "],
            ["comment", "' c"],
        ]);
    });

    test("REM is a comment only at statement start", () => {
        expect(kinds("REM if then")).toEqual([["comment", "REM if then"]]);
        expect(kinds("x = 1 : rem done")).toEqual([["code", "x = 1 : "], ["comment", "rem done"]]);
        expect(kinds("Remove(x)")).toEqual([["code", "Remove(x)"]]);
        expect(kinds("x = y.Rem")).toEqual([["code", "x = y.Rem"]]);
    });

    test("multi-line strings carry state to the next line", () => {
        const first = tokenizeLine(`sql = "SELECT *`);
        expect(first.endState.openString).toEqual({ interpolated: false, braceDepth: 0 });
        const second = tokenizeLine(`  FROM t" & x ' c`, first.endState);
        expect(second.startsInString).toBe(true);
        expect(second.tokens.map((t) => t.kind)).toEqual(["string", "code", "comment"]);
        expect(second.endState.openString).toBeNull();
    });

    test("codeOnly blanks strings and drops comments", () => {
        expect(codeOnly(tokenizeLine(`If s = "then what" Then ' x`).tokens)).toBe(`If s = "" Then `);
    });
});

import { startsInString } from "../src/formatter";

describe("startsInString", () => {
    test("knows which lines continue a multi-line string", () => {
        const text = 'Dim s = "abc\n   def\nghi"\nx = 1\n';
        expect([0, 1, 2, 3].map((line) => startsInString(text, line))).toEqual([false, true, true, false]);
    });
});
