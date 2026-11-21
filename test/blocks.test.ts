import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { analyzeBlocks, format } from "../src/formatter";

const messages = (text: string) => analyzeBlocks(text).problems.map((p) => `${p.line + 1}: ${p.message}`);

describe("analyzeBlocks problems", () => {
    test("balanced code has no problems", () => {
        expect(messages("Sub A()\nIf x Then\ny()\nElse\nz()\nEnd If\nEnd Sub\n")).toEqual([]);
        expect(messages("Select Case x\nCase 1\nIf a Then b()\nCase Else\nc()\nEnd Select\n")).toEqual([]);
        expect(messages("Sub A()\nTry : x() : Catch : End Try\nEnd Sub\n")).toEqual([]);
        expect(messages("Sub A()\nl.ForEach(Sub(x)\ny(x)\nEnd Sub)\nEnd Sub\n")).toEqual([]);
    });

    test("a closer without an opener", () => {
        expect(messages("Sub A()\nx = 1\nEnd If\nEnd Sub\n")).toEqual(["3: End If has no matching If"]);
        expect(messages("Sub A()\nEnd Sub\nEnd Sub\n")).toEqual(["3: End Sub has no matching Sub"]);
    });

    test("one missing End If gives one warning, at the If", () => {
        expect(messages("Sub A()\nIf x Then\ny()\nEnd Sub\nSub B()\nEnd Sub\n"))
            .toEqual(["2: If is not closed before the End Sub on line 4"]);
    });

    test("blocks still open at the end of the file", () => {
        expect(messages("Sub A()\nFor i = 1 To 3\nx()\n")).toEqual(["1: Sub is never closed", "2: For is never closed"]);
    });

    test("Else, Case and Catch outside their block", () => {
        expect(messages("Sub A()\nElse\nEnd Sub\n")).toEqual(["2: Else has no matching If"]);
        expect(messages("Sub A()\nCase 1\nEnd Sub\n")).toEqual(["2: Case has no matching Select Case"]);
        expect(messages("Sub A()\nCatch ex As Exception\nEnd Sub\n")).toEqual(["2: Catch has no matching Try"]);
    });

    test("the wrong closer", () => {
        expect(messages("Sub A()\nFor i = 1 To 3\nx()\nLoop\nEnd Sub\n"))
            .toEqual(["2: For is not closed before the End Sub on line 5", "4: Loop has no matching Do"]);
        expect(messages("Sub A()\nDim f = Function(x)\nReturn x\nEnd Sub\nEnd Sub\n"))
            .toEqual(["2: Function lambda is not closed before the End Sub on line 4", "5: End Sub has no matching Sub"]);
    });

    test("#If branches are alternatives, and directives nest on their own", () => {
        expect(messages("#If DEBUG Then\nSub A()\n#Else\nSub A(x As Integer)\n#End If\ny()\nEnd Sub\n")).toEqual([]);
        expect(messages("Sub A()\n#If X Then\nIf a Then\n#Else\nIf b Then\n#End If\nc()\nEnd If\nEnd Sub\n")).toEqual([]);
        expect(messages("#If X Then\nSub A()\nEnd Sub\n")).toEqual(["1: #If is never closed"]);
        expect(messages("Sub A()\n#End If\nEnd Sub\n")).toEqual(["2: #End If has no matching #If"]);
    });

    test("conditional directives preserve enclosing Select and lambda indentation", () => {
        const expected = [
            "Sub Main()",
            "    Select Case x",
            "        #If A Then",
            "            Case 1",
            "                Dim f = Sub()",
            "                    y()",
            "                End Sub",
            "        #Else",
            "            Case 2",
            "                Dim f = Sub()",
            "                    z()",
            "                End Sub",
            "        #End If",
            "        Case Else",
            "            x()",
            "    End Select",
            "End Sub",
            "",
        ].join("\n");
        expect(format(expected)).toBe(expected);
        expect(messages(expected)).toEqual([]);
    });

    test("Next with multiple counters closes and spans every loop", () => {
        const text = "Sub A()\nFor i = 1 To 3\nFor j = 1 To 3\nx()\nNext j, i\ny()\nEnd Sub\n";
        expect(messages(text)).toEqual([]);
        expect(analyzeBlocks(text).spans.filter((s) => s.keyword === "for")).toEqual([
            { keyword: "for", start: 1, end: 4, middles: [] },
            { keyword: "for", start: 2, end: 4, middles: [] },
        ]);
        expect(messages("For i = 1 To 3\nNext i, j\n")).toEqual(["2: Next has no matching For"]);
    });

    test("code after the end of a multi-line string opens and closes blocks", () => {
        const text = 'Dim s = "abc\ndef" : Sub Foo()\nEnd Sub\n';
        expect(analyzeBlocks(text).problems).toEqual([]);
        expect(analyzeBlocks(text).spans).toEqual([{ keyword: "sub", start: 1, end: 2, middles: [] }]);
        // The line itself is left exactly as written: its start is string content
        expect(format(text).split("\n")[1]).toBe('def" : Sub Foo()');
    });

    test("code after the closing quote continues the string's statement unless a colon ends it", () => {
        // The tail stays inside the LINQ query, so "Select a" is a clause, not a Select Case
        const query = 'Sub A()\nDim q = From a In b\nWhere a.s = "x\ny" And a.t = 1\nSelect a\nEnd Sub\n';
        expect(analyzeBlocks(query).problems).toEqual([]);
        expect(format(query)).toBe('Sub A()\n    Dim q = From a In b\n        Where a.s = "x\ny" And a.t = 1\n        Select a\nEnd Sub\n');
        // A line that closes one string, has code, and opens another still has its code classified
        const reopen = 'Sub A()\nIf a Then\nx = "abc\ndef" : End If : y = "abc\nghi"\nz = 1\nEnd Sub\n';
        expect(analyzeBlocks(reopen).problems).toEqual([]);
        expect(format(reopen).split("\n").slice(-3)).toEqual(["    z = 1", "End Sub", ""]);
    });

    test("block analysis reads the text as written, whatever the formatting options", () => {
        // „ is not a VB string delimiter, so as written there is no string here and the If is open
        expect(messages("If a = „x Then\nEnd If\n")).toEqual([]);
    });

    test("labels do not disturb block pairing", () => {
        expect(analyzeBlocks("Sub Main()\nretry:\nIf a Then GoTo retry\n10:\nEnd Sub\n").problems).toEqual([]);
    });

    test("a multi-line LINQ query is one statement, not a Select Case", () => {
        expect(analyzeBlocks("Dim q = From x In list\nWhere x > 1\nSelect x\ny = 1\n").problems).toEqual([]);
    });

    test("one-word closers pair up whether or not keywords are recased", () => {
        const text = "If a Then\nWhile b\nWend\nEndIf\n";
        expect(analyzeBlocks(text).problems).toEqual([]);
        expect(analyzeBlocks(format(text)).problems).toEqual([]);
    });

    test("Operator and Custom Event blocks", () => {
        expect(analyzeBlocks("Class V\nShared Operator +(a As V, b As V) As V\nReturn a\nEnd Operator\nCustom Event E As EventHandler\nAddHandler(value As EventHandler)\nEnd AddHandler\nRemoveHandler(value As EventHandler)\nEnd RemoveHandler\nRaiseEvent(s As Object, e As EventArgs)\nEnd RaiseEvent\nEnd Event\nEnd Class\n").problems).toEqual([]);
        expect(analyzeBlocks("Class V\nShared Operator +(a As V, b As V) As V\nEnd Class\n").problems.map((p) => p.message)).toEqual(["Operator is not closed before the End Class on line 3"]);
    });

    test("every fixture's formatted output is free of block problems", () => {
        const root = join(import.meta.dir, "fixtures");
        const dirty = readdirSync(root)
            .filter((name) => !existsSync(join(root, name, "todo.md")))
            .filter((name) => analyzeBlocks(readFileSync(join(root, name, "expected.iLogicVb"), "utf8")).problems.length > 0);
        expect(dirty).toEqual([]);
    });
});
