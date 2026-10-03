import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { checkBlocks, format } from "../src/formatter";

const snippets: Record<string, { body: string[] }> = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "snippets", "ilogicvb.code-snippets"), "utf8"));

/** The snippet as inserted with its default values (tabs as 4 spaces). */
function expand(body: string[]): string {
    return body.join("\n")
        .replace(/\$\{\d+\|([^,|]+)[^}]*\|\}/g, "$1")
        .replace(/\$\{\d+:([^}]*)\}/g, "$1")
        .replace(/\$\d+/g, "")
        .replace(/\t/g, "    ");
}

for (const [name, snippet] of Object.entries(snippets)) {
    test(`snippet "${name}" is already formatted and balanced`, () => {
        const text = expand(snippet.body);
        const topLevel = /^(Option|'''|Sub |Function |#Region)/.test(text);
        const doc = topLevel
            ? text.replace(/\n*$/, "\n")
            : "Sub Main()\n" + text.split("\n").map((l) => (l ? "    " + l : l)).join("\n").replace(/\n*$/, "\n") + "End Sub\n";
        // the cursor line ($0) is left indented on purpose; compare ignoring whitespace-only lines
        const blankWs = (t: string) => t.replace(/^[ \t]+$/gm, "");
        expect(format(doc)).toBe(blankWs(doc));
        expect(checkBlocks(doc)).toEqual([]);
        expect(text).not.toMatch(/\$"|MsgBox\(/); // conventions: no interpolation, no MsgBox
    });
}
