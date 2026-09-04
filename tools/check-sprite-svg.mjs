// Guards against the documented failure mode in CLAUDE.md: icons/sprite.svg
// is a real XML document, and a comment containing "--" silently truncates
// the file (every icon stops rendering, zero console error). Run standalone
// via `npm run check:sprite`, or it's called from build.mjs before dist/
// gets a copy of icons/.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function findBadComments(xml) {
  const bad = [];
  const commentRe = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = commentRe.exec(xml))) {
    if (match[1].includes("--")) {
      const line = xml.slice(0, match.index).split("\n").length;
      bad.push(line);
    }
  }
  return bad;
}

// ponytail: regex comment scan, not a full XML parser — upgrade to DOMParser-based
// well-formedness checking if sprite.svg ever grows past flat <symbol> defs.
export function checkSpriteSvg(path = "icons/sprite.svg") {
  const xml = readFileSync(path, "utf8");
  const badLines = findBadComments(xml);
  if (badLines.length) {
    throw new Error(
      `${path}: comment(s) containing "--" at line(s) ${badLines.join(", ")} — this truncates the XML file, remove them`
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkSpriteSvg(process.argv[2]);
    console.log("icons/sprite.svg: OK");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
