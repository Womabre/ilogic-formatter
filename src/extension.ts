import * as vscode from "vscode";
import { format, FormatOptions, formatRange } from "./formatter";

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

    function register(selector: vscode.DocumentSelector): vscode.Disposable {
        return vscode.Disposable.from(
            vscode.languages.registerDocumentFormattingEditProvider(selector, documentProvider),
            vscode.languages.registerDocumentRangeFormattingEditProvider(selector, rangeProvider)
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
