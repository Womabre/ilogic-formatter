// Refuses a release whose changelog is not ready for it. The release workflow
// runs this before anything is built; run it yourself before tagging.
//
//   bun scripts/check-release.ts [--tag v1.2.3] [--today YYYY-MM-DD]
//
// Ready means: the newest version heading in CHANGELOG.md is package.json's
// version, it is dated today, and nothing is left under "## [Unreleased]".
// With --tag, the tag must be "v" + that version too.
import { readFileSync } from "fs";
import { join } from "path";

/** Releases are tagged from here; the changelog date is the date in this zone. */
export const RELEASE_TIME_ZONE = "Europe/Amsterdam";

export interface ChangelogHead {
    /** Whether anything is written under "## [Unreleased]". */
    unreleased: boolean;
    /** The newest version heading, or null when there is none. */
    version: string | null;
    date: string | null;
}

/** The top of a Keep a Changelog file: what is unreleased, and the newest version heading. */
export function changelogHead(changelog: string): ChangelogHead {
    const lines = changelog.split(/\r?\n/);
    const heading = /^## \[([^\]]+)\](?: - (\S+))?\s*$/;
    const first = lines.findIndex((line) => heading.test(line) && !/^## \[unreleased\]/i.test(line));
    const unreleasedAt = lines.findIndex((line) => /^## \[unreleased\]/i.test(line));
    const unreleased = unreleasedAt !== -1 &&
        lines.slice(unreleasedAt + 1, first === -1 || first < unreleasedAt ? undefined : first).some((line) => line.trim() !== "");
    const [, version = null, date = null] = first === -1 ? [] : heading.exec(lines[first])!;
    return { unreleased, version, date };
}

/** The version half, true on every commit: the newest heading is package.json's version. */
export function versionProblems(changelog: string, version: string): string[] {
    const head = changelogHead(changelog);
    if (head.version === version) return [];
    return [`CHANGELOG.md's newest version is ${head.version ?? "missing"}, package.json says ${version}`];
}

/** Everything that stops version `version` from being released on `today` (YYYY-MM-DD). */
export function releaseProblems(changelog: string, version: string, today: string, tag?: string): string[] {
    const head = changelogHead(changelog);
    const problems = versionProblems(changelog, version);
    if (tag !== undefined && tag !== `v${version}`) problems.push(`Tag ${tag} does not match package.json version ${version}`);
    if (head.version === version && head.date !== today) {
        problems.push(`CHANGELOG.md dates ${version} ${head.date ?? "with no date"}, but it is being released on ${today} (${RELEASE_TIME_ZONE})`);
    }
    if (head.unreleased) problems.push(`CHANGELOG.md still has entries under "## [Unreleased]": move them to ${version} or leave them out of this release`);
    return problems;
}

/** Today's date as the changelog writes it, in the release time zone. */
export function today(now: Date = new Date()): string {
    // en-CA formats a date as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", { timeZone: RELEASE_TIME_ZONE }).format(now);
}

if (import.meta.main) {
    const args = process.argv.slice(2);
    const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
    const root = join(import.meta.dir, "..");
    const version: string = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    const problems = releaseProblems(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version, value("--today") ?? today(), value("--tag"));
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log(`${version} is ready to release`);
}
