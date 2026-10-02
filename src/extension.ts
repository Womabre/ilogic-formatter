import * as vscode from "vscode";
import { format, FormatOptions } from "./formatter";

export function activate(context: vscode.ExtensionContext) {
    const iLogicSelector = [
        { language: "ilogicvb" },
        { pattern: "**/*.iLogicVb" },
    ];
    const vbSelector = [
        { language: "vb" },
        { pattern: "**/*.vb" },
    ];

    function getOptions(): FormatOptions {
        const config = vscode.workspace.getConfiguration("ilogicFormatter");
        return {
            indentSize: config.get("indentSize", 4),
            useTabs: config.get("useTabs", false),
            maxBlankLines: config.get("maxBlankLines", 1),
            blankLineAfterBlock: config.get("blankLineAfterBlock", true),
            normalizeKeywords: config.get("normalizeKeywords", true),
            normalizeComments: config.get("normalizeComments", true),
            normalizeUnicode: config.get("normalizeUnicode", true),
        };
    }

    const documentProvider: vscode.DocumentFormattingEditProvider = {
        provideDocumentFormattingEdits(document) {
            const text = document.getText();
            const formatted = format(text, getOptions());
            if (formatted === text) return [];
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            return [vscode.TextEdit.replace(fullRange, formatted)];
        },
    };

    // Also support range formatting (format selection)
    const rangeProvider: vscode.DocumentRangeFormattingEditProvider = {
        provideDocumentRangeFormattingEdits(document, range) {
            const text = document.getText(range);
            const formatted = format(text, getOptions());
            if (formatted === text) return [];
            return [vscode.TextEdit.replace(range, formatted)];
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

    // Register a manual format command
    const command = vscode.commands.registerCommand("ilogicFormatter.formatDocument", () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            vscode.commands.executeCommand("editor.action.formatDocument");
        }
    });
    context.subscriptions.push(command);
}

export function deactivate() {}
