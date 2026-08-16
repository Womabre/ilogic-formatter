import { API_ROOTS } from "./generated/members";

/**
 * What, if anything, should be offered at a cursor position.
 *
 * Deliberately shallow: either the API roots themselves, or the members of a
 * single known root. iLogic has no type information available to us, so any
 * deeper inference would be a guess, and a completion list that guesses is
 * worse than no completion list.
 */
export type CompletionContext =
    | { kind: "roots" }
    | { kind: "members"; root: string }
    | null;

const ROOT_BY_LOWER = new Map(API_ROOTS.map((root) => [root.toLowerCase(), root]));

/**
 * Returns the position of the comment apostrophe on the line, or -1 if the
 * line has no comment. An apostrophe inside a string literal is text.
 */
function commentStart(line: string): number {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inString && line[i + 1] === '"') i++;
            else inString = !inString;
        } else if (ch === "'" && !inString) {
            return i;
        }
    }
    return -1;
}

/** Whether the offset sits inside an unterminated string literal. */
function inStringLiteral(line: string, offset: number): boolean {
    let inString = false;
    for (let i = 0; i < offset; i++) {
        const ch = line[i];
        if (ch !== '"') continue;
        if (inString && line[i + 1] === '"') i++;
        else inString = !inString;
    }
    return inString;
}

export function completionContextAt(line: string, offset: number): CompletionContext {
    const comment = commentStart(line);
    if (comment !== -1 && offset > comment) return null;
    if (inStringLiteral(line, offset)) return null;

    const before = line.slice(0, offset);

    // `Root.partialMember` — offer that root's members. The root must not
    // itself be the tail of a longer expression (ThisDrawing.Sheets.), since
    // the table only describes one level.
    const memberAccess = before.match(/(^|[^A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z0-9_]*$/);
    if (memberAccess) {
        const root = ROOT_BY_LOWER.get(memberAccess[2].toLowerCase());
        return root ? { kind: "members", root } : null;
    }

    // A bare identifier being typed, or an empty position — offer the roots.
    if (/(^|[^A-Za-z0-9_.])[A-Za-z_][A-Za-z0-9_]*$/.test(before) || /(^|\s)$/.test(before)) {
        return { kind: "roots" };
    }

    return null;
}
