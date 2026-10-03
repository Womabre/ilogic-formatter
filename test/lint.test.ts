import { describe, expect, test } from "bun:test";
import { lint, LintRule } from "../src/lint";

const hits = (text: string, disabled: LintRule[] = []) => lint(text, disabled).map((p) => `${p.line + 1}:${p.start}-${p.end} ${p.rule}`);
const S = "Option Strict On\n";

describe("lint", () => {
    test("a rule that follows the conventions is clean", () => {
        expect(hits(S + "Sub Main()\nTry\nx()\nCatch ex As Exception\nLogger.Error(ex.Message)\nEnd Try\nEnd Sub\n")).toEqual([]);
    });

    test("string interpolation", () => {
        expect(hits(S + 'Logger.Info($"x = {x}")\n')).toEqual(["2:12-22 interpolation"]);
        expect(hits(S + 's = "a $ b"\n')).toEqual([]);
    });

    test("message boxes as notifications, not as decisions or inside strings", () => {
        expect(hits(S + 'MsgBox("done")\nMessageBox.Show("Saved", "Title")\n')).toEqual(["2:0-6 msgbox", "3:0-15 msgbox"]);
        expect(hits(S + 'If MessageBox.Show("Go?", "Q", MessageBoxButtons.YesNo) = DialogResult.Yes Then\nEnd If\nDim r = MsgBox("x", vbYesNo)\n')).toEqual([]);
        expect(hits(S + 's = "MsgBox(1)"\n')).toEqual([]);
    });

    test("empty Catch, also on one line; a comment does not count as handling", () => {
        expect(hits(S + "Try\nx()\nCatch\nEnd Try\n")).toEqual(["4:0-5 empty-catch"]);
        expect(hits(S + "Try\nx()\nCatch ex As Exception\n' ignore\nFinally\ny()\nEnd Try\n")).toEqual(["4:0-5 empty-catch"]);
        expect(hits(S + "Try : x() : Catch : End Try\n")).toEqual(["2:12-17 empty-catch"]);
        expect(hits(S + "Try : y() : Catch : n = 0 : End Try\n")).toEqual([]);
    });

    test("Option Strict On, only when the file has code", () => {
        expect(hits("Sub Main()\nEnd Sub\n")).toEqual(["1:0-10 option-strict"]);
        expect(hits("' nothing here\n")).toEqual([]);
        expect(hits("option strict on\nx = 1\n")).toEqual([]);
    });

    test("rules can be turned off", () => {
        expect(hits("MsgBox(1)\n", ["msgbox", "option-strict"])).toEqual([]);
    });
});
