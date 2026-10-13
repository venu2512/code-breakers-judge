/**
 * Output comparison rules. Kept dependency-free so it is easy to unit test.
 * Documented on every problem sheet:
 *  - trailing spaces/tabs on each line are ignored
 *  - blank lines at the end are ignored
 *  - \r\n and \n are treated the same
 */
export function normalizeOutput(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const trimmed = lines.map((l) => l.replace(/[ \t]+$/g, ""));
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  return trimmed.join("\n");
}

export function outputsMatch(expected: string, actual: string): boolean {
  return normalizeOutput(expected) === normalizeOutput(actual);
}

/** A sample solution style token comparison is intentionally NOT used. */
