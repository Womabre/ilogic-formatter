import { describe, expect, test } from "bun:test";
import { foldingRanges, outline, OutlineSymbol } from "../src/structure";

const folds = (text: string) => foldingRanges(text).map((r) => `${r.start + 1}-${r.end + 1}${r.kind ? " " + r.kind : ""}`);
const tree = (symbols: OutlineSymbol[], depth = 0): string[] =>
    symbols.flatMap((s) => [`${"  ".repeat(depth)}${s.kind} ${s.name} ${s.start + 1}-${s.end + 1}`, ...tree(s.children, depth + 1)]);

const classFile = [
    "Imports System", "Imports System.IO", "Namespace Tools", "Public Class Box", "Public Sub New()", "End Sub",
    "Public Property W As Double", "Public ReadOnly Property Area() As Double", "Get", "Return 1", "End Get", "End Property",
    "Public Event Changed()", "Private Function F(x As Integer) As Integer", "Return x", "End Function", "End Class",
    "Public Interface IShape", "Sub Draw()", "End Interface", "End Namespace", "#Region \"Helpers\"", "Sub Helper()",
    "x = 1", "End Sub", "#End Region", "",
].join("\n");

describe("foldingRanges", () => {
    test("blocks fold up to their closing line; If/Else and Case sections fold separately", () => {
        expect(folds("Sub A()\nIf x Then\na()\nElse\nb()\nEnd If\nEnd Sub\n")).toEqual(["1-6", "2-3", "4-5"]);
        expect(folds("Select Case x\nCase 1\na()\nCase 2\nb()\nEnd Select\n")).toEqual(["1-5", "2-3", "4-5"]);
    });

    test("regions, comment runs and Imports runs", () => {
        expect(folds(classFile)).toContain("1-2 imports");
        expect(folds(classFile)).toContain("22-26 region");
        expect(folds("' one\n' two\n' three\nx = 1\n")).toEqual(["1-3 comment"]);
    });

    test("a single-line Try or a one-line comment does not fold", () => {
        expect(folds("Try : x() : Catch : End Try\n' only\n")).toEqual([]);
    });
});

describe("outline", () => {
    test("declarations nest by containment, with the right kinds", () => {
        expect(tree(outline(classFile))).toEqual([
            "namespace Tools 3-21",
            "  class Box 4-17",
            "    constructor New 5-6",
            "    property W 7-7",
            "    property Area 8-12",
            "    event Changed 13-13",
            "    method F 14-16",
            "  interface IShape 18-20",
            "    method Draw 19-19",
            "function Helper 23-25",
        ]);
    });

    test("names keep their casing; attributes and modifiers are skipped", () => {
        const symbols = outline("<DebuggerStepThrough()> Private Sub doWork(x As Double)\nEnd Sub\n");
        expect(symbols.map((s) => [s.name, s.detail])).toEqual([["doWork", "(x As Double)"]]);
    });

    test("the name position points at the name, not an earlier match of it", () => {
        const [f] = outline("Private Function F() As Integer\nReturn 1\nEnd Function\n");
        expect([f.name, f.nameStart]).toEqual(["F", 17]);
        const [x] = outline("    <Obsolete(\"Sub X\")> Public Sub X()\nEnd Sub\n");
        expect(x.nameStart).toBe("    <Obsolete(\"Sub X\")> Public Sub ".length);
    });

    test("statements that merely mention a keyword are not declarations", () => {
        expect(outline("Exit Sub\nEnd Function\nDim f = Function(x) x\nCall Sub1()\n")).toEqual([]);
    });
});
