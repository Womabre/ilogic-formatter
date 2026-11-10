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

export interface SignatureInfo {
    object: ApiObject;
    member: ApiMember;
    /** One entry per overload: the full label and its parameters, as written in the label */
    signatures: { label: string; parameters: string[] }[];
    /** The overload to show: the first one with room for the argument being typed */
    activeSignature: number;
    /** 0-based index of the argument the cursor is in */
    activeParameter: number;
}

/** Splits "(a As T, b As List(Of U))" into its parameters; "()" gives none. */
function parametersOf(signature: string): string[] {
    const inner = signature.trim().replace(/^\(/, "").replace(/\)$/, "");
    const parameters: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
        if (inner[i] === "(") depth++;
        else if (inner[i] === ")") depth--;
        else if (inner[i] === "," && depth === 0) {
            parameters.push(inner.slice(start, i).trim());
            start = i + 1;
        }
    }
    parameters.push(inner.slice(start).trim());
    return parameters.filter((p) => p !== "");
}

/**
 * The call the cursor is inside, for the text left of the cursor: the
 * overloads of `Object.Member(` and which argument is being typed. Null
 * outside a call, in a comment, or for a member whose parameters are not known.
 */
export function signatureAt(linePrefix: string): SignatureInfo | null {
    const tokens = tokenizeLine(linePrefix).tokens;
    if (tokens[tokens.length - 1]?.kind === "comment") return null;
    // Strings blanked at the same length: their commas and parentheses are not code
    const code = tokens.map((t) => (t.kind === "code" ? t.text : " ".repeat(t.text.length))).join("");

    let depth = 0;
    let commas = 0;
    let open = -1;
    for (let i = code.length - 1; i >= 0 && open < 0; i--) {
        const ch = code[i];
        if (ch === ")" || ch === "}") depth++;
        else if (ch === "{") depth--;
        else if (ch === "(") {
            if (depth > 0) depth--;
            else open = i;
        } else if (ch === "," && depth === 0) commas++;
    }
    if (open < 0) return null;

    const call = /(?<![\w.])([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*$/.exec(code.slice(0, open));
    if (!call) return null;
    const object = findObject(call[1]);
    const member = object?.members.find((x) => x.name.toLowerCase() === call[2].toLowerCase());
    if (!object || !member?.signatures?.length) return null;

    const signatures = member.signatures.map((s) => ({ label: `${object.name}.${member.name}${s}`, parameters: parametersOf(s) }));
    const fits = signatures.findIndex((s) => s.parameters.length > commas);
    return { object, member, signatures, activeSignature: fits >= 0 ? fits : signatures.length - 1, activeParameter: commas };
}

/**
 * What a completed member inserts. A method gets its parentheses, with the
 * cursor inside when it takes arguments; a property, or a name typed in front
 * of parentheses that are already there, is inserted as it is.
 */
export function memberInsertion(member: ApiMember, textAfterCursor: string): { text: string; cursorInside: boolean } {
    if (member.kind !== "method" || /^\s*\(/.test(textAfterCursor)) return { text: member.name, cursorInside: false };
    const takesArguments = !member.signatures || member.signatures.some((s) => parametersOf(s).length > 0);
    return { text: member.name + "()", cursorInside: takesArguments };
}
