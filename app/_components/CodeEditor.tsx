"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import type { Language } from "@/lib/languages";

// Serve Monaco from our own server. Must be set before any editor mounts.
loader.config({ paths: { vs: "/monaco/vs" } });

const MONACO_LANGUAGE: Record<Language, string> = {
  python: "python",
  c: "c",
  cpp: "cpp",
  java: "java",
  javascript: "javascript",
};

export default function CodeEditor({
  language,
  value,
  onChange,
  readOnly = false,
  height = "460px",
  blockPaste = false,
  onPaste,
}: {
  language: Language;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  blockPaste?: boolean;
  onPaste?: (blocked: boolean) => void;
}) {
  const onMount: OnMount = (editor) => {
    editor.updateOptions({ tabSize: 4, fontSize: 14, minimap: { enabled: false } });
    const dom = editor.getDomNode();
    dom?.addEventListener(
      "paste",
      (e) => {
        onPaste?.(blockPaste);
        if (blockPaste) e.preventDefault();
      },
      true
    );
  };

  return (
    <div className="editor-shell">
      <Editor
        height={height}
        language={MONACO_LANGUAGE[language]}
        value={value}
        theme="vs-dark"
        onChange={(v) => onChange(v ?? "")}
        onMount={onMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 14,
          tabSize: 4,
          automaticLayout: true,
          wordWrap: "on",
        }}
        loading={<div style={{ padding: 16 }} className="muted">Loading editor…</div>}
      />
    </div>
  );
}
