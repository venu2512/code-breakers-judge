import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOutput, outputsMatch } from "../lib/compare";

test("trailing spaces on each line are ignored", () => {
  assert.equal(outputsMatch("5\n", "5   \n"), true);
  assert.equal(outputsMatch("a b\n", "a b\t\n"), true);
});

test("blank lines at the end are ignored", () => {
  assert.equal(outputsMatch("42", "42\n\n\n"), true);
  assert.equal(outputsMatch("42", "42\n"), true);
});

test("CRLF and LF are treated the same", () => {
  assert.equal(outputsMatch("1\n2\n3", "1\r\n2\r\n3\r\n"), true);
});

test("internal blank lines still matter", () => {
  assert.equal(outputsMatch("a\n\nb", "a\nb"), false);
});

test("leading whitespace is significant", () => {
  assert.equal(outputsMatch("  x", "x"), false);
});

test("different values do not match", () => {
  assert.equal(outputsMatch("10", "100"), false);
});

test("normalizeOutput strips only trailing blank lines", () => {
  assert.equal(normalizeOutput("a  \nb\n\n"), "a\nb");
  assert.equal(normalizeOutput(""), "");
  assert.equal(normalizeOutput("\n\n"), "");
});
