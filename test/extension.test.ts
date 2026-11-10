// Runs activate() against a small stand-in for the vscode module, so the
// wiring in extension.ts (providers, diagnostics, quick fixes, commands) is
// exercised without an editor. It checks what the extension asks VS Code to
// do, not how VS Code then behaves.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll } from "bun:test";
import { format } from "../src/formatter";

type Fn = (...args: any[]) => any;

class Position { constructor(public line: number, public character: number) {} }
class Range {
    start: Position;
    end: Position;
    constructor(a: number | Position, b: number | Position, c?: number, d?: number) {
        this.start = a instanceof Position ? a : new Position(a, b as number);
        this.end = b instanceof Position ? b : new Position(c!, d!);
    }
}
class WorkspaceEdit {
    edits: { range: Range; text: string }[] = [];
    replace(_uri: unknown, range: Range, text: string) { this.edits.push({ range, text }); }
    insert(_uri: unknown, position: Position, text: string) { this.edits.push({ range: new Range(position, position), text }); }
}
class Plain { constructor(...args: any[]) { Object.assign(this, { args }); } }
class Diagnostic {
    source?: string;
    code?: string;
    relatedInformation?: unknown[];
    constructor(public range: Range, public message: string, public severity: number) {}
}
class CodeAction {
    edit?: WorkspaceEdit;
    command?: { command: string; arguments: unknown[] };
    constructor(public title: string, public kind: string) {}
}

const state = {
    providers: {} as Record<string, any[]>,
    commands: {} as Record<string, Fn>,
    settings: {} as Record<string, unknown>,
    updates: [] as { key: string; value: unknown; target: number }[],
    folders: undefined as unknown[] | undefined,
    diagnostics: {} as Record<string, Map<string, Diagnostic[]>>,
    documents: [] as any[],
    warnings: [] as string[],
    languageChanges: [] as [string, string][],
    listeners: {} as Record<string, Fn[]>,
};

const provider = (kind: string) => (selector: unknown, p: unknown) => {
    (state.providers[kind] ??= []).push({ selector, provider: p });
    return { dispose() {} };
};
const event = (name = "") => (listener: Fn) => {
    (state.listeners[name] ??= []).push(listener);
    return { dispose() {} };
};
const fire = (name: string, ...args: unknown[]) => (state.listeners[name] ?? []).forEach((listener) => listener(...args));

const vscode = {
    Position, Range, WorkspaceEdit, Diagnostic, CodeAction,
    MarkdownString: Plain, Hover: Plain, SignatureHelp: Plain, SignatureInformation: Plain, ParameterInformation: Plain,
    SnippetString: class { constructor(public value: string) {} }, DocumentSymbol: Plain, FoldingRange: Plain, CompletionItem: Plain,
    Location: Plain, DiagnosticRelatedInformation: Plain,
    TextEdit: { replace: (range: Range, newText: string) => ({ range, newText }) },
    Disposable: { from: () => ({ dispose() {} }) },
    SymbolKind: new Proxy({}, { get: (_t, name) => name }),
    FoldingRangeKind: { Comment: 1, Region: 2, Imports: 3 },
    CompletionItemKind: { Method: 1, Property: 2, Variable: 3 },
    DiagnosticSeverity: { Warning: 1, Information: 2 },
    CodeActionKind: { QuickFix: "quickfix" },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    languages: {
        registerCompletionItemProvider: provider("completion"),
        registerHoverProvider: provider("hover"),
        registerSignatureHelpProvider: provider("signature"),
        registerDocumentSymbolProvider: provider("symbols"),
        registerFoldingRangeProvider: provider("folding"),
        registerDocumentFormattingEditProvider: provider("format"),
        registerDocumentRangeFormattingEditProvider: provider("range"),
        registerOnTypeFormattingEditProvider: provider("onType"),
        registerCodeActionsProvider: provider("codeActions"),
        setTextDocumentLanguage: async (doc: any, languageId: string) => { state.languageChanges.push([doc.fileName, languageId]); doc.languageId = languageId; return doc; },
        createDiagnosticCollection: (name: string) => {
            const map = (state.diagnostics[name] = new Map<string, Diagnostic[]>());
            return { set: (uri: unknown, d: Diagnostic[]) => map.set(String(uri), d), delete: (uri: unknown) => map.delete(String(uri)), dispose() {} };
        },
    },
    workspace: {
        get workspaceFolders() { return state.folders; },
        get textDocuments() { return state.documents; },
        getConfiguration: () => ({
            get: (key: string, fallback: unknown) => (key in state.settings ? state.settings[key] : fallback),
            update: async (key: string, value: unknown, target: number) => { state.updates.push({ key, value, target }); },
        }),
        onDidChangeConfiguration: event("configuration"),
        onDidOpenTextDocument: event("open"),
        onDidChangeTextDocument: event("change"),
        onDidCloseTextDocument: event("close"),
        createFileSystemWatcher: () => ({ onDidChange: event(), onDidCreate: event(), onDidDelete: event(), dispose() {} }),
    },
    window: {
        activeTextEditor: undefined,
        showWarningMessage: async (message: string) => { state.warnings.push(message); },
    },
    commands: {
        registerCommand: (name: string, fn: Fn) => { state.commands[name] = fn; return { dispose() {} }; },
        registerTextEditorCommand: (name: string, fn: Fn) => { state.commands[name] = fn; return { dispose() {} }; },
    },
};
mock.module("vscode", () => vscode);
const { activate } = await import("../src/extension");

function document(text: string, languageId = "ilogicvb", path = "/rule.iLogicVb") {
    const lines = text.split("\n");
    return {
        // A real path makes the extension look for a settings file next to it; "untitled" is an unsaved rule
        uri: { scheme: path === "/rule.iLogicVb" ? "untitled" : "file", fsPath: path, toString: () => (path === "/rule.iLogicVb" ? "file:///rule" : "file://" + path) },
        fileName: path, languageId, lineCount: lines.length,
        getText: (range?: Range) => (range ? lines.slice(range.start.line, range.end.line + 1).join("\n") : text),
        lineAt: (line: number) => {
            const lineText = lines[line];
            return { text: lineText, lineNumber: line, firstNonWhitespaceCharacterIndex: lineText.search(/\S|$/), range: new Range(line, 0, line, lineText.length) };
        },
    };
}

/** Applies range edits to text, last edit first so earlier positions stay valid. */
function apply(text: string, edits: { range: Range; text: string }[]): string {
    const lines = text.split("\n");
    const offset = (p: Position) => lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
    return [...edits]
        .sort((a, b) => offset(b.range.start) - offset(a.range.start))
        .reduce((t, e) => t.slice(0, offset(e.range.start)) + e.text + t.slice(offset(e.range.end)), text);
}

function start(documents: any[] = [], settings: Record<string, unknown> = {}) {
    Object.assign(state, { providers: {}, commands: {}, settings, updates: [], folders: undefined, diagnostics: {}, documents, warnings: [], languageChanges: [], listeners: {} });
    activate({ subscriptions: [] } as any);
}

describe("extension", () => {
    beforeEach(() => start());

    test("every .vb provider can activate: the manifest lists the languages the code registers for", () => {
        const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));
        const contributed = pkg.contributes.languages.map((l: { id: string }) => l.id);
        // vb belongs to VS Code's own Visual Basic extension: activate on it, never redefine it
        expect(contributed).toEqual(["ilogicvb"]);
        expect(pkg.activationEvents).toContain("onLanguage:vb");
        expect(state.providers.format.map((p) => p.selector[0].language)).toEqual(["ilogicvb", "vb"]);
    });

    test("Format Document edits only the lines that change", () => {
        const text = "Sub Main()\n    x = 1\nif a then\n    y = 2\nEnd If\nEnd Sub\n";
        const edits = state.providers.format[0].provider.provideDocumentFormattingEdits(document(text), { tabSize: 4, insertSpaces: true });
        expect(edits).toHaveLength(1);
        expect(edits[0].range).toEqual(new Range(2, 0, 5, 0));
        expect(apply(text, edits.map((e: any) => ({ range: e.range, text: e.newText })))).toBe(format(text));
        expect(state.providers.format[0].provider.provideDocumentFormattingEdits(document(format(text)), {})).toEqual([]);
    });

    test("the Format iLogic Rule command applies the same edit", () => {
        const text = "sub main()\nEnd Sub\n";
        const applied: { range: Range; text: string }[] = [];
        state.commands["ilogicFormatter.formatDocument"](
            { document: document(text), options: { tabSize: 4, insertSpaces: true } },
            { replace: (range: Range, newText: string) => applied.push({ range, text: newText }) });
        expect(apply(text, applied)).toBe("Sub main()\nEnd Sub\n");
    });

    test("block warnings and convention hints are published for an open rule", () => {
        start([document("Sub Main()\nIf a Then\nEnd Sub\n")]);
        expect(state.diagnostics["ilogic-formatter"].get("file:///rule")!.map((d) => d.message)).toEqual(["If is not closed before the End Sub on line 3"]);
        expect(state.diagnostics["ilogic-conventions"].get("file:///rule")!.map((d) => d.code)).toEqual(["option-strict"]);
    });

    test("\"Don't show this hint\" saves to the workspace, or to user settings when no folder is open", async () => {
        await state.commands["ilogicFormatter.disableHint"]("msgbox");
        state.folders = [{}];
        await state.commands["ilogicFormatter.disableHint"]("msgbox");
        expect(state.updates).toEqual([
            { key: "disabledHints", value: ["msgbox"], target: vscode.ConfigurationTarget.Global },
            { key: "disabledHints", value: ["msgbox"], target: vscode.ConfigurationTarget.Workspace },
        ]);
    });

    test("the empty-Catch quick fix logs the exception, indented with the file's settings", () => {
        const text = "Try\n  x()\nCatch\nEnd Try\n";
        const doc = document(text);
        const diagnostic = Object.assign(new Diagnostic(new Range(2, 0, 2, 5), "", 1), { source: "iLogic conventions", code: "empty-catch" });
        state.settings = { indentSize: 2 };
        const actions: CodeAction[] = state.providers.codeActions[0].provider.provideCodeActions(doc, diagnostic.range, { diagnostics: [diagnostic] });
        expect(actions.map((a) => a.title)).toEqual(["Log the exception", "Don't show \"empty-catch\" hints anywhere"]);
        expect(apply(text, actions[0].edit!.edits)).toBe("Try\n  x()\nCatch ex As Exception\n  Logger.Error(\"Failed: \" & ex.Message)\nEnd Try\n");
    });

    test(".vb files open as iLogic VB by default; .vbs and friends are left alone", () => {
        const rule = document("x = 1\n", "vb", "/rules/Flange.vb");
        const script = document("x = 1\n", "vb", "/scripts/tool.vbs");
        start([rule, script]);
        const later = document("y = 2\n", "vb", "/rules/Later.VB");
        fire("open", later);
        expect(state.languageChanges).toEqual([["/rules/Flange.vb", "ilogicvb"], ["/rules/Later.VB", "ilogicvb"]]);
        expect(script.languageId).toBe("vb");
    });

    test("a .vb file switched back to Visual Basic by hand stays that way", () => {
        const rule = document("x = 1\n", "vb", "/rules/Flange.vb");
        start([rule]);
        // Picking another language closes the iLogic document and opens it again as vb
        fire("close", rule);
        rule.languageId = "vb";
        fire("open", rule);
        expect(state.languageChanges).toEqual([["/rules/Flange.vb", "ilogicvb"]]);
    });

    test("vbFilesAreILogic off leaves .vb files as Visual Basic, and toggling it switches open files", () => {
        const rule = document("x = 1\n", "vb", "/rules/Flange.vb");
        start([rule], { vbFilesAreILogic: false });
        expect(state.languageChanges).toEqual([]);
        expect(state.providers.format.map((p) => p.selector[0].language)).toEqual(["ilogicvb", "vb"]); // still formatted as vb

        state.settings = { vbFilesAreILogic: true };
        fire("configuration", { affectsConfiguration: (key: string) => key === "ilogicFormatter.vbFilesAreILogic" });
        state.settings = { vbFilesAreILogic: false };
        fire("configuration", { affectsConfiguration: (key: string) => key === "ilogicFormatter.vbFilesAreILogic" });
        expect(state.languageChanges).toEqual([["/rules/Flange.vb", "ilogicvb"], ["/rules/Flange.vb", "vb"]]);
    });

    test("a settings file can say that the .vb files under it are not rules", () => {
        const folder = realpathSync(mkdtempSync(join(tmpdir(), "ilogic-ext-")));
        cleanup.push(folder);
        writeFileSync(join(folder, ".ilogicformat.json"), JSON.stringify({ vbFilesAreILogic: false }));
        start([document("x = 1\n", "vb", join(folder, "Program.vb")), document("x = 1\n", "vb", "/elsewhere/Rule.vb")]);
        expect(state.languageChanges).toEqual([["/elsewhere/Rule.vb", "ilogicvb"]]);
    });

    test("a .ilogicformat.json next to the rule wins over the editor settings, for formatting and hints", () => {
        const folder = realpathSync(mkdtempSync(join(tmpdir(), "ilogic-ext-")));
        cleanup.push(folder);
        writeFileSync(join(folder, ".ilogicformat.json"), JSON.stringify({ indentSize: 2, disabledHints: ["option-strict"], allowCommentedCatch: true }));
        const text = "Sub Main()\nTry\nx()\nCatch\n' the property may not exist\nEnd Try\nEnd Sub\n";
        const doc = document(text, "ilogicvb", join(folder, "Rule.iLogicVb"));
        start([doc], { indentSize: 8 });
        const edits = state.providers.format[0].provider.provideDocumentFormattingEdits(doc, { tabSize: 4, insertSpaces: true });
        expect(apply(text, edits.map((e: any) => ({ range: e.range, text: e.newText })))).toBe(format(text, { indentSize: 2 }));
        expect(state.diagnostics["ilogic-conventions"].get(String(doc.uri))).toEqual([]);
        expect(state.warnings).toEqual([]);
    });

    test("a settings file that cannot be used is reported once and ignored", () => {
        const folder = realpathSync(mkdtempSync(join(tmpdir(), "ilogic-ext-")));
        cleanup.push(folder);
        writeFileSync(join(folder, ".ilogicformat.json"), '{"indentSize": 99}');
        const doc = document("Sub Main()\nx = 1\nEnd Sub\n", "ilogicvb", join(folder, "Rule.iLogicVb"));
        start([doc]);
        const edits = state.providers.format[0].provider.provideDocumentFormattingEdits(doc, { tabSize: 4, insertSpaces: true });
        expect(edits[0].newText).toBe("    x = 1\n");
        expect(state.warnings).toHaveLength(1);
        expect(state.warnings[0]).toContain('"indentSize" must be a whole number from 1 to 16');
    });

    test("parameter hints inside a call, and methods completed with their parentheses", () => {
        const at = (line: string) => state.providers.signature[0].provider.provideSignatureHelp(document(line), new Position(0, line.length));
        const help = at('x = iProperties.Value("Project", ');
        expect(help.activeParameter).toBe(1);
        expect(help.signatures).toHaveLength(2);
        expect(at("x = Foo(")).toBeUndefined();

        const complete = (line: string, column = line.length) =>
            state.providers.completion[0].provider.provideCompletionItems(document(line), new Position(0, column));
        const item = (items: any[], name: string) => items.find((i) => i.args[0] === name);
        const run = item(complete("iLogicVb."), "RunRule");
        expect(run.insertText.value).toBe("RunRule($0)");
        expect(run.command.command).toBe("editor.action.triggerParameterHints");
        expect(item(complete("iLogicVb.(x)", 9), "RunRule").insertText).toBeUndefined(); // parentheses already there
        expect(item(complete("iProperties."), "Value").insertText).toBeUndefined(); // a property
    });
});
const cleanup: string[] = [];
afterAll(() => cleanup.forEach((folder) => rmSync(folder, { recursive: true, force: true })));
