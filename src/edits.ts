// Turns "replace the whole document" into the smallest edit that covers the
// lines that changed, so the cursor, selection and folded regions outside the
// change stay where they are.

export interface LineEdit {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
    text: string;
}

/**
 * The edit that turns `before` into `after` (both with "\n" line endings),
 * or null when they are equal. Lines shared at the start and the end of the
 * two texts are left out of the edit.
 */
export function minimalLineEdit(before: string, after: string): LineEdit | null {
    if (before === after) return null;
    const a = before.split("\n");
    const b = after.split("\n");
    const shortest = Math.min(a.length, b.length);
    let prefix = 0;
    while (prefix < shortest && a[prefix] === b[prefix]) prefix++;
    let suffix = 0;
    while (suffix < shortest - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

    const inserted = b.slice(prefix, b.length - suffix);
    if (suffix > 0) {
        // Whole lines, each with its line break, up to the first shared trailing line
        return {
            startLine: prefix, startCharacter: 0,
            endLine: a.length - suffix, endCharacter: 0,
            text: inserted.map((line) => line + "\n").join(""),
        };
    }
    // The change reaches the end of the text, where there is no line break to anchor on
    const last = a.length - 1;
    if (prefix === 0) {
        return { startLine: 0, startCharacter: 0, endLine: last, endCharacter: a[last].length, text: inserted.join("\n") };
    }
    return {
        startLine: prefix - 1, startCharacter: a[prefix - 1].length,
        endLine: last, endCharacter: a[last].length,
        text: inserted.map((line) => "\n" + line).join(""),
    };
}
