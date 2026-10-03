import * as vscode from "vscode";
import { BlockProblem, checkBlocks, format, FormatOptions, formatRange, startsInString } from "./formatter";
import { foldingRanges, outline, OutlineSymbol, SymbolKind } from "./structure";
import { hoverAt, memberMarkdown, objectMarkdown, suggestionsFor } from "./completion";
import { lint, LintRule } from "./lint";

const SYMBOL_KINDS: Record<SymbolKind, vscode.SymbolKind> = {
    class: vscode.SymbolKind.Class,
    module: vscode.SymbolKind.Module,
    struct: vscode.SymbolKind.Struct,
    interface: vscode.SymbolKind.Interface,
    enum: vscode.SymbolKind.Enum,
    namespace: vscode.SymbolKind.Namespace,
    method: vscode.SymbolKind.Method,
    function: vscode.SymbolKind.Function,
    constructor: vscode.SymbolKind.Constructor,
    property: vscode.SymbolKind.Property,
    event: vscode.SymbolKind.Event,
    operator: vscode.SymbolKind.Operator,
};

const FOLDING_KINDS = {
    comment: vscode.FoldingRangeKind.Comment,
    region: vscode.FoldingRangeKind.Region,
    imports: vscode.FoldingRangeKind.Imports,
};

/** The editor's indentation for a file, as VS Code passes it to formatters. */
interface EditorIndent {
    tabSize?: number | string;
    insertSpaces?: boolean | string;
}

export function activate(context: vscode.ExtensionContext) {
    const iLogicSelector = [
        { language: "ilogicvb" },
        { pattern: "**/*.iLogicVb" },
    ];
    const vbSelector = [
        { language: "vb" },
        { pattern: "**/*.vb" },
    ];

    /**
     * Formatter options for a document. indentSize and useTabs follow the
     * editor's Tab Size / Insert Spaces unless the user set them explicitly.
     * Out-of-range numbers from settings.json are clamped.
     */
    function getOptions(document: vscode.TextDocument, editor?: EditorIndent): FormatOptions {
        const config = vscode.workspace.getConfiguration("ilogicFormatter", document);
        const indentSize = config.get<number | null>("indentSize", null);
        const useTabs = config.get<boolean | null>("useTabs", null);
        const editorTabSize = typeof editor?.tabSize === "number" ? editor.tabSize : 4;
        const editorUsesTabs = typeof editor?.insertSpaces === "boolean" ? !editor.insertSpaces : false;
        return {
            indentSize: clamp(indentSize ?? editorTabSize, 1, 16, 4),
            useTabs: useTabs ?? editorUsesTabs,
            maxBlankLines: clamp(config.get("maxBlankLines", 1), 0, 100, 1),
            blankLineAfterBlock: config.get("blankLineAfterBlock", true),
            normalizeKeywords: config.get("normalizeKeywords", true),
            normalizeComments: config.get("normalizeComments", true),
            normalizeUnicode: config.get("normalizeUnicode", true),
        };
    }

    /** One edit replacing the whole document, or none when formatting changes nothing. */
    function formatDocumentEdits(document: vscode.TextDocument, editor?: EditorIndent): vscode.TextEdit[] {
        const text = document.getText();
        const formatted = format(text, getOptions(document, editor));
        if (formatted === text.replace(/\r\n/g, "\n")) return [];
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }

    const documentProvider: vscode.DocumentFormattingEditProvider = {
        provideDocumentFormattingEdits(document, options) {
            return formatDocumentEdits(document, options);
        },
    };

    // Range formatting (Format Selection, format on paste): formats the touched
    // lines with indentation taken from the whole document.
    const rangeProvider: vscode.DocumentRangeFormattingEditProvider = {
        provideDocumentRangeFormattingEdits(document, range, options) {
            const startLine = range.start.line;
            let endLine = range.end.line;
            // A selection ending at column 0 does not include that line
            if (range.end.character === 0 && endLine > startLine) endLine--;
            const formatted = formatRange(document.getText(), startLine, endLine, getOptions(document, options));
            const lineRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
            if (formatted === document.getText(lineRange).replace(/\r\n/g, "\n")) return [];
            return [vscode.TextEdit.replace(lineRange, formatted)];
        },
    };

    // Format on type (Enter): the line just finished gets its final indent and
    // casing, and the new line starts where the formatter would put the next
    // statement. On by default for iLogic files (configurationDefaults).
    const onTypeProvider: vscode.OnTypeFormattingEditProvider = {
        provideOnTypeFormattingEdits(document, position, ch, options) {
            const line = position.line;
            if (ch !== "\n" || line < 1) return [];
            const opts = getOptions(document, options);
            const text = document.getText().replace(/\r\n/g, "\n");
            const lines = text.split("\n");
            const edits: vscode.TextEdit[] = [];

            const prev = line - 1;
            if (lines[prev].trim() !== "" && !startsInString(text, prev)) {
                const formatted = formatRange(text, prev, prev, opts).split("\n")[0];
                if (formatted.trim() !== "" && formatted !== lines[prev]) {
                    edits.push(vscode.TextEdit.replace(document.lineAt(prev).range, formatted));
                }
            }

            if (!startsInString(text, line)) {
                // Probe with a placeholder statement when the new line is empty
                const current = lines[line] ?? "";
                const probeLines = [...lines];
                probeLines[line] = current.trim() === "" ? "x" : current;
                const probe = formatRange(probeLines.join("\n"), line, line, opts).split("\n")[0];
                const indent = probe.match(/^\s*/)![0];
                const oldIndent = current.match(/^\s*/)![0];
                if (indent !== oldIndent) {
                    edits.push(vscode.TextEdit.replace(new vscode.Range(line, 0, line, oldIndent.length), indent));
                }
            }
            return edits;
        },
    };

    // Outline, breadcrumbs and Go to Symbol (Ctrl+Shift+O)
    const symbolProvider: vscode.DocumentSymbolProvider = {
        provideDocumentSymbols(document) {
            const toSymbol = (s: OutlineSymbol): vscode.DocumentSymbol => {
                const range = new vscode.Range(s.start, 0, s.end, document.lineAt(s.end).text.length);
                const selection = new vscode.Range(s.nameLine, s.nameStart, s.nameLine, s.nameStart + s.name.length);
                const symbol = new vscode.DocumentSymbol(s.name, s.detail, SYMBOL_KINDS[s.kind], range, selection);
                symbol.children = s.children.map(toSymbol);
                return symbol;
            };
            return outline(document.getText()).map(toSymbol);
        },
    };

    // Folding: blocks (split at Else/Case/Catch), #Region, comment and Imports runs
    const foldingProvider: vscode.FoldingRangeProvider = {
        provideFoldingRanges(document) {
            return foldingRanges(document.getText()).map((r) =>
                new vscode.FoldingRange(r.start, r.end, r.kind ? FOLDING_KINDS[r.kind] : undefined));
        },
    };

    // Completion and hover for the predefined iLogic objects (ThisDoc, Logger, ...)
    const completionProvider: vscode.CompletionItemProvider = {
        provideCompletionItems(document, position) {
            const suggestions = suggestionsFor(document.lineAt(position.line).text.slice(0, position.character));
            if (!suggestions) return [];
            if (suggestions.kind === "members") {
                return suggestions.members.map((member) => {
                    const item = new vscode.CompletionItem(member.name,
                        member.kind === "method" ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Property);
                    item.detail = `${suggestions.object.name}.${member.name} (${suggestions.object.type})`;
                    item.documentation = new vscode.MarkdownString(memberMarkdown(suggestions.object, member));
                    return item;
                });
            }
            return suggestions.objects.map((object) => {
                const item = new vscode.CompletionItem(object.name, vscode.CompletionItemKind.Variable);
                item.detail = object.type;
                item.documentation = new vscode.MarkdownString(objectMarkdown(object));
                return item;
            });
        },
    };

    const hoverProvider: vscode.HoverProvider = {
        provideHover(document, position) {
            const info = hoverAt(document.lineAt(position.line).text, position.character);
            if (!info) return undefined;
            return new vscode.Hover(new vscode.MarkdownString(info.markdown),
                new vscode.Range(position.line, info.start, position.line, info.end));
        },
    };

    function register(selector: vscode.DocumentSelector): vscode.Disposable {
        return vscode.Disposable.from(
            vscode.languages.registerCompletionItemProvider(selector, completionProvider, "."),
            vscode.languages.registerHoverProvider(selector, hoverProvider),
            vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider),
            vscode.languages.registerFoldingRangeProvider(selector, foldingProvider),
            vscode.languages.registerDocumentFormattingEditProvider(selector, documentProvider),
            vscode.languages.registerDocumentRangeFormattingEditProvider(selector, rangeProvider),
            vscode.languages.registerOnTypeFormattingEditProvider(selector, onTypeProvider, "\n")
        );
    }

    // .iLogicVb files are always formatted
    context.subscriptions.push(register(iLogicSelector));

    // .vb files are formatted unless ilogicFormatter.formatVbFiles is false.
    // Registered only while enabled, so VS Code does not list this extension
    // as a .vb formatter once the user opts out.
    let vbRegistration: vscode.Disposable | undefined;
    function updateVbRegistration() {
        const enabled = vscode.workspace.getConfiguration("ilogicFormatter").get("formatVbFiles", true);
        if (enabled && !vbRegistration) {
            vbRegistration = register(vbSelector);
        } else if (!enabled && vbRegistration) {
            vbRegistration.dispose();
            vbRegistration = undefined;
        }
    }
    updateVbRegistration();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("ilogicFormatter.formatVbFiles")) updateVbRegistration();
        }),
        { dispose: () => vbRegistration?.dispose() }
    );

    // ── Warnings for unbalanced blocks (End If without If, unclosed Sub, ...) ──
    const diagnostics = vscode.languages.createDiagnosticCollection("ilogic-formatter");
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    /** Same files the formatter handles, unless warnings are switched off. */
    function shouldCheck(document: vscode.TextDocument): boolean {
        const config = vscode.workspace.getConfiguration("ilogicFormatter", document);
        if (!config.get("warnUnbalancedBlocks", true)) return false;
        if (document.languageId === "ilogicvb" || /\.ilogicvb$/i.test(document.fileName)) return true;
        return document.languageId === "vb" && vscode.workspace.getConfiguration("ilogicFormatter").get("formatVbFiles", true);
    }

    function toDiagnostic(document: vscode.TextDocument, problem: BlockProblem): vscode.Diagnostic {
        const line = document.lineAt(Math.min(problem.line, document.lineCount - 1));
        const range = new vscode.Range(line.lineNumber, line.firstNonWhitespaceCharacterIndex, line.lineNumber, line.text.length);
        const diagnostic = new vscode.Diagnostic(range, problem.message, vscode.DiagnosticSeverity.Warning);
        diagnostic.source = "iLogic Formatter";
        if (problem.relatedLine !== undefined && problem.relatedLine < document.lineCount) {
            diagnostic.relatedInformation = [new vscode.DiagnosticRelatedInformation(
                new vscode.Location(document.uri, document.lineAt(problem.relatedLine).range), "closed here")];
        }
        return diagnostic;
    }

    // Convention hints (.iLogicVb only: $"..." is valid in ordinary VB.NET projects)
    const hints = vscode.languages.createDiagnosticCollection("ilogic-conventions");

    function isILogic(document: vscode.TextDocument): boolean {
        return document.languageId === "ilogicvb" || /\.ilogicvb$/i.test(document.fileName);
    }

    function updateHints(document: vscode.TextDocument) {
        if (!isILogic(document)) {
            hints.delete(document.uri);
            return;
        }
        const disabled = vscode.workspace.getConfiguration("ilogicFormatter", document).get<LintRule[]>("disabledHints", []);
        hints.set(document.uri, lint(document.getText(), disabled).map((p) => {
            const diagnostic = new vscode.Diagnostic(new vscode.Range(p.line, p.start, p.line, p.end), p.message,
                p.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
            diagnostic.source = "iLogic conventions";
            diagnostic.code = p.rule;
            return diagnostic;
        }));
    }

    function updateDiagnostics(document: vscode.TextDocument) {
        updateHints(document);
        if (!shouldCheck(document)) {
            diagnostics.delete(document.uri);
            return;
        }
        const problems = checkBlocks(document.getText(), getOptions(document));
        diagnostics.set(document.uri, problems.map((p) => toDiagnostic(document, p)));
    }

    /** Re-check shortly after typing stops, not on every keystroke. */
    function scheduleDiagnostics(document: vscode.TextDocument) {
        const key = document.uri.toString();
        clearTimeout(pending.get(key));
        pending.set(key, setTimeout(() => {
            pending.delete(key);
            updateDiagnostics(document);
        }, 300));
    }

    vscode.workspace.textDocuments.forEach(updateDiagnostics);
    context.subscriptions.push(
        diagnostics,
        vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
        vscode.workspace.onDidChangeTextDocument((e) => scheduleDiagnostics(e.document)),
        vscode.workspace.onDidCloseTextDocument((document) => {
            clearTimeout(pending.get(document.uri.toString()));
            pending.delete(document.uri.toString());
            diagnostics.delete(document.uri);
            hints.delete(document.uri);
        }),
        hints,
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("ilogicFormatter")) vscode.workspace.textDocuments.forEach(updateDiagnostics);
        }),
        { dispose: () => pending.forEach((timer) => clearTimeout(timer)) }
    );

    // Quick fixes for convention hints, plus "don't show this hint"
    const codeActions: vscode.CodeActionProvider = {
        provideCodeActions(document, _range, context) {
            const actions: vscode.CodeAction[] = [];
            for (const diagnostic of context.diagnostics) {
                if (diagnostic.source !== "iLogic conventions") continue;
                const rule = String(diagnostic.code) as LintRule;
                if (rule === "option-strict") {
                    const text = document.getText();
                    const missing = ["Option Strict On", "Option Explicit On"]
                        .filter((o) => !new RegExp("^\\s*" + o.replace(/ On$/, "") + "\\s+On\\b", "im").test(text));
                    const fix = new vscode.CodeAction("Add " + missing.join(" and "), vscode.CodeActionKind.QuickFix);
                    fix.edit = new vscode.WorkspaceEdit();
                    fix.edit.insert(document.uri, new vscode.Position(0, 0), missing.join("\n") + "\n");
                    fix.diagnostics = [diagnostic];
                    fix.isPreferred = true;
                    actions.push(fix);
                }
                if (rule === "empty-catch") {
                    const line = document.lineAt(diagnostic.range.start.line);
                    const m = /^(\s*)Catch(?:\s+(\w+)\s+As\s+[\w.]+)?\s*(?:'.*)?$/i.exec(line.text);
                    if (m) { // only a Catch on its own line; one-line Try...End Try is left to the user
                        const variable = m[2] ?? "ex";
                        const unit = m[1].includes("\t") ? "\t" : "    ";
                        const fix = new vscode.CodeAction("Log the exception", vscode.CodeActionKind.QuickFix);
                        fix.edit = new vscode.WorkspaceEdit();
                        if (!m[2]) fix.edit.replace(document.uri, new vscode.Range(line.lineNumber, m[1].length, line.lineNumber, m[1].length + 5), "Catch ex As Exception");
                        fix.edit.insert(document.uri, new vscode.Position(line.lineNumber + 1, 0),
                            `${m[1]}${unit}Logger.Error("Failed: " & ${variable}.Message)\n`);
                        fix.diagnostics = [diagnostic];
                        fix.isPreferred = true;
                        actions.push(fix);
                    }
                }
                const off = new vscode.CodeAction(`Don't show "${rule}" hints in this workspace`, vscode.CodeActionKind.QuickFix);
                off.command = { command: "ilogicFormatter.disableHint", title: off.title, arguments: [rule] };
                actions.push(off);
            }
            return actions;
        },
    };
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(iLogicSelector, codeActions, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
        vscode.commands.registerCommand("ilogicFormatter.disableHint", async (rule: LintRule) => {
            const config = vscode.workspace.getConfiguration("ilogicFormatter");
            const current = config.get<LintRule[]>("disabledHints", []);
            if (!current.includes(rule)) await config.update("disabledHints", [...current, rule], vscode.ConfigurationTarget.Workspace);
        })
    );

    // "iLogic: Format iLogic Rule" always uses this formatter, whichever
    // formatter is the default for the file.
    const command = vscode.commands.registerTextEditorCommand("ilogicFormatter.formatDocument", (editor, edit) => {
        for (const e of formatDocumentEdits(editor.document, editor.options)) edit.replace(e.range, e.newText);
    });
    context.subscriptions.push(command);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
}

export function deactivate() {}
