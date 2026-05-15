import * as vscode from "vscode";
import { format, FormatOptions } from "./formatter";

export function activate(context: vscode.ExtensionContext) {
    const selector = [
        { language: "ilogicvb" },
        { pattern: "**/*.iLogicVb" },
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

    // Register formatter for .iLogicVb and .vb files
    const provider = vscode.languages.registerDocumentFormattingEditProvider(selector, {
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
    });

    // Also support range formatting (format selection)
    const rangeProvider = vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
        provideDocumentRangeFormattingEdits(document, range) {
            const text = document.getText(range);
            const formatted = format(text, getOptions());
            if (formatted === text) return [];
            return [vscode.TextEdit.replace(range, formatted)];
        },
    });

    context.subscriptions.push(provider, rangeProvider);

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
