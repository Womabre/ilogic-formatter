import { test } from "node:test";
import assert from "node:assert/strict";
import { completionContextAt } from "../src/completion-model";

/** Completion is requested at the end of the given text. */
const at = (line: string) => completionContextAt(line, line.length);

test("offers members after a known API root and a dot", () => {
    assert.deepEqual(at("GoExcel."), { kind: "members", root: "GoExcel" });
});

test("offers members while a member name is being typed", () => {
    assert.deepEqual(at("GoExcel.Cell"), { kind: "members", root: "GoExcel" });
});

test("offers members mid-statement", () => {
    assert.deepEqual(at("    i = GoExcel."), { kind: "members", root: "GoExcel" });
});

test("offers members inside a call argument", () => {
    assert.deepEqual(at("MessageBox.Show(ThisDoc."), { kind: "members", root: "ThisDoc" });
});

test("matches an API root case-insensitively but reports its canonical name", () => {
    assert.deepEqual(at("goexcel."), { kind: "members", root: "GoExcel" });
    assert.deepEqual(at("ILOGICVB."), { kind: "members", root: "iLogicVb" });
});

test("offers roots when an identifier is being typed on its own", () => {
    assert.deepEqual(at("GoEx"), { kind: "roots" });
    assert.deepEqual(at("    "), { kind: "roots" });
});

test("offers nothing after an unknown root", () => {
    assert.equal(at("Sheet_1."), null);
    assert.equal(at("myLocal.Some"), null);
});

test("offers nothing inside a string literal", () => {
    assert.equal(at('MessageBox.Show("GoExcel.'), null);
    assert.equal(at('Dim s = "text'), null);
});

test("offers members again after a string literal closes", () => {
    assert.deepEqual(at('MessageBox.Show("done") : GoExcel.'), { kind: "members", root: "GoExcel" });
});

test("offers nothing inside a comment", () => {
    assert.equal(at("' GoExcel."), null);
    assert.equal(at("Dim x = 1 ' GoExcel."), null);
});

test("treats an apostrophe inside a string as text, not a comment", () => {
    assert.deepEqual(at("Dim s = \"it's fine\" : GoExcel."), { kind: "members", root: "GoExcel" });
});

test("offers nothing after a chained member access", () => {
    // The member table is one level deep; guessing beyond it would be wrong.
    assert.equal(at("ThisDrawing.Sheets."), null);
});
