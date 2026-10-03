import { describe, expect, test } from "bun:test";
import { hoverAt, suggestionsFor } from "../src/completion";
import { ILOGIC_OBJECTS } from "../src/ilogicApi";

const memberNames = (prefix: string) => {
    const s = suggestionsFor(prefix);
    return s?.kind === "members" ? s.members.map((m) => m.name) : s?.kind ?? null;
};

describe("suggestionsFor", () => {
    test("members after a predefined object and a dot, any casing", () => {
        expect(memberNames("    Logger.")).toEqual(["Trace", "Debug", "Info", "Warn", "Error", "Fatal"]);
        expect(memberNames("logger.In")).toContain("Info");
        expect(memberNames("x = ThisDoc.Path")).toContain("PathAndFileName");
        expect(memberNames("iProperties.")).toContain("Value");
    });

    test("object names while typing an identifier", () => {
        expect(suggestionsFor("Thi")?.kind).toBe("objects");
        expect(suggestionsFor("x = Para")?.kind).toBe("objects");
    });

    test("nothing in strings, comments, after other objects, or without a word", () => {
        expect(suggestionsFor('s = "Logger.')).toBeNull();
        expect(suggestionsFor("' Logger.")).toBeNull();
        expect(suggestionsFor("oDoc.Component.")).toBeNull();
        expect(suggestionsFor("x = 1 +")).toBeNull();
        expect(suggestionsFor("ThisApplication.")).toBeNull(); // Inventor API, not listed here
    });
});

describe("hoverAt", () => {
    test("members and objects", () => {
        expect(hoverAt('Logger.Info("x")', 8)?.markdown).toContain("**Logger.Info** (method)");
        expect(hoverAt("x = ThisDoc.PathAndFileName(True)", 5)?.markdown).toContain("**ThisDoc** `ICadDoc`");
        expect(hoverAt("x = ThisDoc.PathAndFileName(True)", 15)?.markdown).toContain("withExtension");
    });

    test("nothing inside strings or on members of other objects", () => {
        expect(hoverAt('s = "ThisDoc"', 6)).toBeNull();
        expect(hoverAt("x = oDoc.Component", 12)).toBeNull();
    });
});

describe("API data", () => {
    test("names are unique and every documented object links to its reference page", () => {
        const names = ILOGIC_OBJECTS.map((o) => o.name.toLowerCase());
        expect(new Set(names).size).toBe(names.length);
        const withoutPage = ILOGIC_OBJECTS.filter((o) => !o.page).map((o) => o.name);
        expect(withoutPage).toEqual(["ThisApplication", "ThisServer"]);
    });

    test("members have unique names and short summaries", () => {
        for (const o of ILOGIC_OBJECTS) {
            const names = o.members.map((m) => m.name);
            expect({ object: o.name, unique: new Set(names).size === names.length }).toEqual({ object: o.name, unique: true });
            for (const m of o.members) expect(m.summary.length).toBeLessThanOrEqual(100);
        }
    });
});
