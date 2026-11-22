import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { changelogHead, releaseProblems, today, versionProblems } from "../scripts/check-release";

const changelog = (unreleased: string, heading: string) =>
    `# Changelog\n\nIntro.\n\n## [Unreleased]\n${unreleased}\n${heading}\n\n### Fixed\n\n- Something.\n\n## [1.0.0] - 2026-01-01\n`;
const READY = changelog("", "## [1.2.3] - 2026-11-22");

describe("this repository", () => {
    test("the changelog's newest version is package.json's version", () => {
        const root = join(import.meta.dir, "..");
        const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
        expect(versionProblems(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version)).toEqual([]);
    });
});

describe("release check", () => {
    test("a dated heading for the version, with nothing unreleased, is ready", () => {
        expect(releaseProblems(READY, "1.2.3", "2026-11-22", "v1.2.3")).toEqual([]);
    });

    test("a heading dated the day the version was bumped, released a day later, is refused", () => {
        expect(releaseProblems(changelog("", "## [1.2.3] - 2026-11-21"), "1.2.3", "2026-11-22")).toEqual([
            "CHANGELOG.md dates 1.2.3 2026-11-21, but it is being released on 2026-11-22 (Europe/Amsterdam)",
        ]);
    });

    test("a heading without a date is refused", () => {
        expect(releaseProblems(changelog("", "## [1.2.3]"), "1.2.3", "2026-11-22")).toHaveLength(1);
    });

    test("entries left under Unreleased are refused", () => {
        const problems = releaseProblems(changelog("\n### Added\n\n- New.\n", "## [1.2.3] - 2026-11-22"), "1.2.3", "2026-11-22");
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain("Unreleased");
    });

    test("a version with no heading of its own is refused, once", () => {
        expect(releaseProblems(READY, "1.2.4", "2026-11-22")).toEqual(["CHANGELOG.md's newest version is 1.2.3, package.json says 1.2.4"]);
    });

    test("a tag that is not v + the version is refused", () => {
        expect(releaseProblems(READY, "1.2.3", "2026-11-22", "v1.2.4")).toEqual(["Tag v1.2.4 does not match package.json version 1.2.3"]);
        expect(releaseProblems(READY, "1.2.3", "2026-11-22", "1.2.3")).toHaveLength(1);
    });

    test("a changelog with no version heading at all is refused", () => {
        expect(changelogHead("# Changelog\n\n## [Unreleased]\n\n- New.\n")).toEqual({ unreleased: true, version: null, date: null });
        expect(releaseProblems("# Changelog\n", "1.2.3", "2026-11-22")).toEqual(["CHANGELOG.md's newest version is missing, package.json says 1.2.3"]);
    });

    test("CRLF line endings read the same", () => {
        expect(releaseProblems(READY.replace(/\n/g, "\r\n"), "1.2.3", "2026-11-22")).toEqual([]);
    });

    test("today is the date in Amsterdam, not in UTC", () => {
        expect(today(new Date("2026-11-21T23:30:00Z"))).toBe("2026-11-22");
        expect(today(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
        expect(today(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
    });
});
