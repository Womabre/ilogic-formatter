import * as vscode from "vscode";
import { completionContextAt } from "./completion-model";
import { API_ROOTS, MEMBERS } from "./generated/members";

/**
 * Completions for the iLogic API roots and their members.
 *
 * The data comes from data/ilogic-fragments.md by way of the generator, so
 * coverage is exactly what the fragment library uses — incomplete by design,
 * but never invented. Registered for iLogicVb rules only: these names do not
 * exist in a plain VB.NET file.
 */
export function registerCompletions(context: vscode.ExtensionContext): void {
    const provider = vscode.languages.registerCompletionItemProvider(
        [{ language: "ilogicvb" }, { pattern: "**/*.iLogicVb" }],
        {
            provideCompletionItems(document, position) {
                if (!vscode.workspace.getConfiguration("ilogicFormatter").get("enableCompletions", true)) {
                    return undefined;
                }

                const line = document.lineAt(position.line).text;
                const result = completionContextAt(line, position.character);
                if (result === null) return undefined;

                if (result.kind === "roots") {
                    return API_ROOTS.map((root) => {
                        const item = new vscode.CompletionItem(root, vscode.CompletionItemKind.Class);
                        item.detail = "iLogic";
                        return item;
                    });
                }

                const members = MEMBERS[result.root] ?? [];
                return members.map((member) => {
                    const kind =
                        member.kind === "method"
                            ? vscode.CompletionItemKind.Method
                            : vscode.CompletionItemKind.Property;
                    const item = new vscode.CompletionItem(member.name, kind);
                    item.detail = `${result.root}.${member.name}`;
                    return item;
                });
            },
        },
        "."
    );

    context.subscriptions.push(provider);
}
