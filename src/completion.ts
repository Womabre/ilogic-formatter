// What to suggest and show on hover for the predefined iLogic objects.
// Pure functions over a line of text, so they can be tested without VS Code.

import { ApiMember, ApiObject, findObject, ILOGIC_OBJECTS, REFERENCE_BASE } from "./ilogicApi";
import { tokenizeLine } from "./tokenizer";

export type Suggestions =
    | { kind: "members"; object: ApiObject; members: ApiMember[] }
    | { kind: "objects"; objects: ApiObject[] };

/**
 * Suggestions for the text left of the cursor: members after "ThisDoc.",
 * object names while typing an identifier, nothing inside strings or comments.
 */
export function suggestionsFor(linePrefix: string): Suggestions | null {
    const tokens = tokenizeLine(linePrefix).tokens;
    const last = tokens[tokens.length - 1];
    if (last && last.kind !== "code") return null; // in a string or comment
    const code = last ? last.text : "";

    const member = /(?<![\w.])([A-Za-z_]\w*)\s*\.\s*(\w*)$/.exec(code);
    if (member) {
        const object = findObject(member[1]);
        return object && object.members.length > 0 ? { kind: "members", object, members: object.members } : null;
    }
    const word = /(?<![\w.])([A-Za-z_]\w*)$/.exec(code);
    if (word) return { kind: "objects", objects: ILOGIC_OBJECTS };
    return null;
}

export interface HoverInfo {
    /** The text range hovered, as columns in the line */
    start: number;
    end: number;
    markdown: string;
}

/** Hover text for an iLogic object name or one of its members at `character`. */
export function hoverAt(line: string, character: number): HoverInfo | null {
    // Nothing inside strings or comments
    let column = 0;
    for (const token of tokenizeLine(line).tokens) {
        const end = column + token.text.length;
        if (character >= column && character < end && token.kind !== "code") return null;
        column = end;
    }
    const words = /[A-Za-z_]\w*/g;
    let m: RegExpExecArray | null;
    while ((m = words.exec(line)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (character < start || character > end) continue;
        const before = line.slice(0, start);
        const owner = /(?<![\w.])([A-Za-z_]\w*)\s*\.\s*$/.exec(before);
        if (owner) {
            const object = findObject(owner[1]);
            const member = object?.members.find((x) => x.name.toLowerCase() === m![0].toLowerCase());
            return object && member ? { start, end, markdown: memberMarkdown(object, member) } : null;
        }
        if (/\.\s*$/.test(before)) return null; // a member of something else
        const object = findObject(m[0]);
        return object ? { start, end, markdown: objectMarkdown(object) } : null;
    }
    return null;
}

export function objectMarkdown(object: ApiObject): string {
    const link = object.page ? `\n\n[iLogic API reference](${REFERENCE_BASE}${object.page})` : "";
    return `**${object.name}** \`${object.type}\`\n\n${object.summary}${link}`;
}

export function memberMarkdown(object: ApiObject, member: ApiMember): string {
    const signatures = (member.signatures ?? []).map((s) => `${object.name}.${member.name}${s}`);
    const code = signatures.length > 0 ? "\n\n```vb\n" + signatures.join("\n") + "\n```" : "";
    const link = object.page ? `\n\n[iLogic API reference](${REFERENCE_BASE}${object.page})` : "";
    return `**${object.name}.${member.name}** (${member.kind})\n\n${member.summary}${code}${link}`;
}
