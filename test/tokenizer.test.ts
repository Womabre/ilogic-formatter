import { describe, expect, test } from "bun:test";
import { codeOnly, maskedCode, scanLines, tokenizeLine } from "../src/tokenizer";

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

describe("scanLines", () => {
    test("knows which lines continue a multi-line string", () => {
        const text = 'Dim s = "abc\n   def\nghi"\nx = 1\n';
        expect(scanLines(text).map((l) => l.startsInString)).toEqual([false, true, true, false, false]);
    });

    test("code is the code after the closing quote on a line that ends a multi-line string", () => {
        const lines = scanLines('Dim s = "abc\ndef" : MsgBox("x") \' done\nx = 1');
        expect(lines.map((l) => l.code)).toEqual(['Dim s = ""', ': MsgBox("")', "x = 1"]);
        expect(lines[1].hasComment).toBe(true);
        expect(lines[1].commentOnly).toBe(false);
    });

    test("lines inside a string have no code and are not comment-only", () => {
        const lines = scanLines('s = "a\n\' not a comment\nb"');
        expect(lines.map((l) => [l.code, l.commentOnly])).toEqual([['s = ""', false], ["", false], ["", false]]);
    });

    test("masked keeps columns: strings and comments become spaces of the same width", () => {
        const [line] = scanLines(`  If s = "Catch" Then ' Catch`);
        expect(line.masked).toBe(`  If s =         Then        `);
        expect(line.masked.length).toBe(line.raw.length);
        expect(maskedCode(tokenizeLine(`x = "a"`).tokens)).toBe(`x =    `);
    });

    test("a repeated text returns the same shared result", () => {
        const text = "Sub Main()\nEnd Sub\n";
        expect(scanLines(text)).toBe(scanLines(text));
    });
});
