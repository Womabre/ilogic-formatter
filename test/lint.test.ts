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

    test("message boxes after Then, Else and a colon", () => {
        expect(hits(S + 'If a Then MsgBox("hi") Else MsgBox("no")\n')).toEqual(["2:10-16 msgbox", "2:28-34 msgbox"]);
        expect(hits(S + 'x = "a: b" : MessageBox.Show("there") \' MsgBox(1)\n')).toEqual(["2:13-28 msgbox"]);
        expect(hits(S + 'Foo(prompt:=MsgBox("x"))\n')).toEqual([]);
    });

    test("empty Catch, also on one line; a comment does not count as handling", () => {
        expect(hits(S + "Try\nx()\nCatch\nEnd Try\n")).toEqual(["4:0-5 empty-catch"]);
        expect(hits(S + "Try\nx()\nCatch ex As Exception\n' ignore\nFinally\ny()\nEnd Try\n")).toEqual(["4:0-5 empty-catch"]);
        expect(hits(S + "Try : x() : Catch : End Try\n")).toEqual(["2:12-17 empty-catch"]);
        expect(hits(S + "Try : y() : Catch : n = 0 : End Try\n")).toEqual([]);
    });

    test("the empty-Catch hint points at the Catch, not at a \"catch\" in a string before it", () => {
        expect(hits(S + 'Try : s = "catch" : Catch : End Try\n')).toEqual(["2:20-25 empty-catch"]);
        expect(hits(S + "Try : x.[Catch]() : Catch : End Try\n")).toEqual(["2:20-25 empty-catch"]);
    });

    test("code after the end of a multi-line string is checked like any other code", () => {
        expect(hits(S + 'Sub Main()\nDim s = "abc\ndef" : MsgBox("x")\nEnd Sub\n')).toEqual(["4:7-13 msgbox"]);
        // The string continued from the line above is not a new $"..." string
        expect(hits(S + 'Dim s = "abc\n$def"\n')).toEqual([]);
    });

    test("allowCommentedCatch accepts a Catch that explains itself, and nothing else", () => {
        const allow = (text: string) => lint(S + text, [], { allowCommentedCatch: true }).map((p) => p.rule);
        expect(allow("Try\nx()\nCatch\n' the property may not exist\nEnd Try\n")).toEqual([]);
        expect(allow("Try\nx()\nCatch ex As Exception ' optional property\nEnd Try\n")).toEqual([]);
        expect(allow("Try : x() : Catch : End Try ' optional\n")).toEqual([]);
        expect(allow("Try\nx()\nCatch\nEnd Try\n")).toEqual(["empty-catch"]);
        expect(allow("Try\nx()\nCatch\nFinally\n' a comment in Finally is not in the Catch\nEnd Try\n")).toEqual(["empty-catch"]);
    });

    test("Option Strict On, only when the file has code", () => {
        expect(hits("Sub Main()\nEnd Sub\n")).toEqual(["1:0-10 option-strict"]);
        expect(hits("' nothing here\n")).toEqual([]);
        expect(hits("option strict on\nx = 1\n")).toEqual([]);
    });

    test("If() that combines ThisApplication and ThisServer, not the guard or an If statement", () => {
        expect(hits(S + "Dim oApp As Application = If(ThisApplication IsNot Nothing, ThisApplication, ThisServer)\n"))
            .toEqual(["2:26-88 thisserver-fallback"]);
        expect(hits(S + "x = If(ThisServer, ThisApplication)\n")).toEqual(["2:4-35 thisserver-fallback"]);
        expect(hits(S + "If ThisApplication Is Nothing AndAlso ThisServer Is Nothing Then\nEnd If\n")).toEqual([]);
        expect(hits(S + "If (ThisApplication Is Nothing AndAlso ThisServer Is Nothing) Then\nEnd If\n")).toEqual([]);
        expect(hits(S + "If a Then x = 1 Else If (ThisApplication Is Nothing AndAlso ThisServer Is Nothing) Then y = 2\n")).toEqual([]);
        expect(hits(S + "x = If(ThisApplication IsNot Nothing, 1, 2)\n")).toEqual([]);
        expect(hits(S + 's = "If(ThisApplication, ThisServer)" \' If(ThisApplication, ThisServer)\n')).toEqual([]);
    });

    test("File. and Environment. without their namespace", () => {
        expect(hits(S + "Imports System.IO\nIf File.Exists(p) Then\nEnd If\n")).toEqual(["3:3-7 ambiguous-name"]);
        expect(hits(S + "s = Environment.NewLine\n")).toEqual(["2:4-15 ambiguous-name"]);
        expect(hits(S + "If System.IO.File.Exists(p) Then\nEnd If\ns = System.Environment.NewLine\n")).toEqual([]);
        expect(hits(S + "n = oDoc.File.FullFileName\nDim myFile As String = p\nx = myFile.Length\n")).toEqual([]);
        expect(hits(S + 's = "File.Exists" \' Environment.NewLine\n')).toEqual([]);
    });

    test("rules can be turned off", () => {
        expect(hits("MsgBox(1)\n", ["msgbox", "option-strict"])).toEqual([]);
    });
});
