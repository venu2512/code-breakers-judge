// Client-safe constants: no secrets, no process.env. Safe to import anywhere.

export type Language = "python" | "c" | "cpp" | "java" | "javascript";

export const ALL_LANGUAGES: Language[] = [
  "python",
  "c",
  "cpp",
  "java",
  "javascript",
];

export const LANGUAGE_LABELS: Record<Language, string> = {
  python: "Python 3",
  c: "C (gcc)",
  cpp: "C++ (g++)",
  java: "Java",
  javascript: "JavaScript (Node)",
};

export const LANGUAGE_FILE: Record<Language, string> = {
  python: "main.py",
  c: "main.c",
  cpp: "main.cpp",
  java: "Main.java",
  javascript: "main.js",
};

export function parseAllowedLanguages(raw: string | undefined): Language[] {
  if (!raw) return [...ALL_LANGUAGES];
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid = wanted.filter((l): l is Language =>
    (ALL_LANGUAGES as string[]).includes(l)
  );
  return valid.length ? valid : [...ALL_LANGUAGES];
}

/**
 * Interpreted and JVM languages pay a startup cost on every test. Multiply the
 * problem's base time limit by this factor so they are not failed unfairly.
 */
export const LANGUAGE_TIME_MULTIPLIER: Record<Language, number> = {
  python: 2.5,
  javascript: 2,
  java: 3,
  c: 1,
  cpp: 1,
};
