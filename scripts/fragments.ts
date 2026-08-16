/**
 * Parses data/ilogic-fragments.md into the structures the generator writes out.
 *
 * Kept free of any file system access so it can be tested directly; see
 * generate.ts for the I/O around it.
 */

export interface Fragment {
    /** Level-4 heading — becomes the snippet's key and its label in the picker. */
    name: string;
    /** What the user types to expand the snippet. */
    prefix: string;
    /** One-line explanation shown beside the snippet. */
    description: string;
    /** Level-2 heading: the API area the fragment belongs to. */
    category: string;
    /** Level-3 heading: the family of related fragments within the category. */
    family: string;
    /** Snippet body, in VS Code snippet syntax. */
    body: string;
}

export interface Snippet {
    prefix: string;
    body: string[];
    description: string;
}

/**
 * API roots that iLogic exposes to every rule. A member is only collected for
 * completion if it is reached through one of these — anything else in a
 * fragment body is a local variable, and suggesting its members would be a
 * guess.
 */
export const API_ROOTS = [
    "ActiveSheet",
    "Component",
    "GoExcel",
    "InventorVb",
    "MessageBox",
    "MultiValue",
    "Parameter",
    "SharedVariable",
    "ThisApplication",
    "ThisBOM",
    "ThisDoc",
    "ThisDrawing",
    "ThisServer",
    "iLogicVb",
] as const;

const HEADING_2 = /^##\s+(.+?)\s*$/;
const HEADING_3 = /^###\s+(.+?)\s*$/;
const HEADING_4 = /^####\s+(.+?)\s*$/;
const ANY_HEADING = /^#{2,4}\s+/;
// `prefix` — description. Em dash or hyphen, description optional.
const PREFIX_LINE = /^`([^`]+)`(?:\s*[—-]\s*(.*))?$/;
const VB_FENCE_OPEN = /^```\s*vb\s*$/;
const VB_FENCE_CLOSE = /^```\s*$/;

/**
 * Drops blocks fenced with four or more backticks. The document uses them to
 * show an example of its own format, and the ```vb fence nested inside must
 * not be mistaken for a real fragment.
 */
function stripLongFences(lines: string[]): string[] {
    const out: string[] = [];
    let fence: string | null = null;
    for (const line of lines) {
        const match = line.match(/^(`{4,})/);
        if (fence === null) {
            if (match) {
                fence = match[1];
                continue;
            }
            out.push(line);
        } else if (match && match[1].length >= fence.length) {
            fence = null;
        }
    }
    return out;
}

export function parseFragments(markdown: string): Fragment[] {
    const lines = stripLongFences(markdown.split(/\r?\n/));
    const fragments: Fragment[] = [];
    const seen = new Map<string, string>();
    let category = "";
    let family = "";

    for (let i = 0; i < lines.length; i++) {
        const h2 = lines[i].match(HEADING_2);
        if (h2) {
            category = h2[1];
            family = "";
            continue;
        }

        const h3 = lines[i].match(HEADING_3);
        if (h3) {
            family = h3[1];
            continue;
        }

        const h4 = lines[i].match(HEADING_4);
        if (!h4) continue;
        const name = h4[1];

        // Prefix line: the next non-blank line, and it must stay within this
        // fragment — a heading means the prefix line is missing entirely.
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        const prefixMatch = j < lines.length ? lines[j].match(PREFIX_LINE) : null;
        if (!prefixMatch) {
            throw new Error(`Fragment "${name}" is missing its prefix line (expected \`prefix\` — description).`);
        }
        const prefix = prefixMatch[1];
        const description = (prefixMatch[2] ?? "").trim();

        const previous = seen.get(prefix);
        if (previous !== undefined) {
            throw new Error(`Duplicate prefix "${prefix}" on fragments "${previous}" and "${name}".`);
        }
        seen.set(prefix, name);

        // Body: the next vb fence, which must come before the next heading.
        let k = j + 1;
        while (k < lines.length && !VB_FENCE_OPEN.test(lines[k])) {
            if (ANY_HEADING.test(lines[k])) break;
            k++;
        }
        if (k >= lines.length || !VB_FENCE_OPEN.test(lines[k])) {
            throw new Error(`Fragment "${name}" is missing its body (expected a \`\`\`vb code fence).`);
        }

        const bodyLines: string[] = [];
        let closed = false;
        for (let b = k + 1; b < lines.length; b++) {
            if (VB_FENCE_CLOSE.test(lines[b])) {
                closed = true;
                i = b;
                break;
            }
            bodyLines.push(lines[b]);
        }
        if (!closed) {
            throw new Error(`Fragment "${name}" has an unterminated body fence.`);
        }

        fragments.push({ name, prefix, description, category, family, body: bodyLines.join("\n") });
    }

    return fragments;
}

export function toSnippets(fragments: Fragment[]): Record<string, Snippet> {
    const snippets: Record<string, Snippet> = {};
    for (const fragment of fragments) {
        snippets[fragment.name] = {
            prefix: fragment.prefix,
            body: fragment.body.split("\n"),
            description: fragment.description,
        };
    }
    return snippets;
}

/**
 * Reduces snippet syntax to the code it would insert if the user tabbed
 * through without changing anything. Used before scanning a body for API
 * members, so that `${1:d0}` does not read as an identifier.
 */
export function stripPlaceholders(body: string): string {
    return body
        .replace(/\$\{\d+\|([^|]*)\|\}/g, (_, choices: string) => choices.split(",")[0] ?? "")
        .replace(/\$\{\d+:([^}]*)\}/g, "$1")
        .replace(/\$\{\d+\}/g, "")
        .replace(/\$\d+/g, "");
}

/** Blanks out the contents of string literals, keeping the quotes. */
function blankStringLiterals(code: string): string {
    let out = "";
    let inString = false;
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (ch === '"') {
            inString = !inString;
            out += '"';
        } else {
            out += inString ? " " : ch;
        }
    }
    return out;
}

export interface Member {
    name: string;
    /**
     * Whether the fragment library ever calls this member with an argument
     * list. Drives nothing but the icon shown in the completion list, so a
     * member seen only without parentheses is reported as a property.
     */
    kind: "method" | "property";
}

export function toMemberTable(fragments: Fragment[]): Record<string, Member[]> {
    const roots = new Set<string>(API_ROOTS);
    const collected = new Map<string, Map<string, Member["kind"]>>();

    for (const fragment of fragments) {
        const code = blankStringLiterals(stripPlaceholders(fragment.body));
        for (const match of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*(\()?/g)) {
            const [, root, name, paren] = match;
            if (!roots.has(root)) continue;
            let members = collected.get(root);
            if (!members) {
                members = new Map<string, Member["kind"]>();
                collected.set(root, members);
            }
            // A single call site with parentheses is enough to call it a
            // method; seeing it elsewhere without them does not undo that.
            if (paren || members.get(name) === "method") members.set(name, "method");
            else if (!members.has(name)) members.set(name, "property");
        }
    }

    const table: Record<string, Member[]> = {};
    for (const root of [...collected.keys()].sort()) {
        const members = collected.get(root)!;
        table[root] = [...members.keys()]
            .sort()
            .map((name) => ({ name, kind: members.get(name)! }));
    }
    return table;
}
