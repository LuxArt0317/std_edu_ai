import { useEffect } from "react";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const extensions = [
  StarterKit,
  Link.configure({
    openOnClick: false,
    autolink: true,
    defaultProtocol: "https",
    protocols: ["http", "https", "mailto"],
  }),
  Placeholder.configure({
    placeholder:
      "Explain the concept, add examples, instructions, lists, and key ideas…",
  }),
];

export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions,
    content: value,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: {
      attributes: {
        class: "lms-rich-document",
        "aria-label": "Learning material content",
      },
    },
  });
  useEffect(() => {
    if (editor && editor.getHTML() !== value)
      editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
  }, [editor, value]);
  if (!editor) return null;
  const link = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("HTTPS link", previous || "https://");
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: href.trim() })
        .run();
  };
  return (
    <div className="lms-rich-editor">
      <div className="lms-rich-toolbar">
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "active" : ""}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 3 }) ? "active" : ""}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          H3
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          type="button"
          className={editor.isActive("orderedList") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </button>
        <button
          type="button"
          className={editor.isActive("blockquote") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </button>
        <button
          type="button"
          className={editor.isActive("link") ? "active" : ""}
          onClick={link}
        >
          Link
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          ↷
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextContent({ html }: { html: string }) {
  const editor = useEditor({
    extensions,
    content: html,
    editable: false,
    editorProps: {
      attributes: { class: "lms-rich-document lms-rich-readonly" },
    },
  });
  useEffect(() => {
    if (editor && editor.getHTML() !== html)
      editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
  }, [editor, html]);
  return <EditorContent editor={editor} />;
}
