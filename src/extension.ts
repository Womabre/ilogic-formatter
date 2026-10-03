import * as vscode from "vscode";
import { BlockProblem, checkBlocks, format, FormatOptions, formatRange, startsInString } from "./formatter";

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

    function register(selector: vscode.DocumentSelector): vscode.Disposable {
        return vscode.Disposable.from(
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

    function updateDiagnostics(document: vscode.TextDocument) {
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
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("ilogicFormatter")) vscode.workspace.textDocuments.forEach(updateDiagnostics);
        }),
        { dispose: () => pending.forEach((timer) => clearTimeout(timer)) }
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
