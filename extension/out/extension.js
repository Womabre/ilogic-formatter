"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const formatter_1 = require("./formatter");
function activate(context) {
    const selector = [
        { language: "ilogicvb" },
        { pattern: "**/*.iLogicVb" },
        { language: "vb" },
        { pattern: "**/*.vb" },
    ];
    function getOptions() {
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
            const formatted = (0, formatter_1.format)(text, getOptions());
            if (formatted === text)
                return [];
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
            return [vscode.TextEdit.replace(fullRange, formatted)];
        },
    });
    // Also support range formatting (format selection)
    const rangeProvider = vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
        provideDocumentRangeFormattingEdits(document, range) {
            const text = document.getText(range);
            const formatted = (0, formatter_1.format)(text, getOptions());
            if (formatted === text)
                return [];
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
function deactivate() { }
//# sourceMappingURL=extension.js.map