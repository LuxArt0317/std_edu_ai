import { useEffect, useRef, useState } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

function safeVideoSource(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Video links must use HTTPS.");
  if (url.hostname === "youtu.be") return { src: `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`, kind: "embed" };
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    const id = url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
    if (!id) throw new Error("That YouTube link does not contain a video identifier.");
    return { src: `https://www.youtube-nocookie.com/embed/${id}`, kind: "embed" };
  }
  if (["vimeo.com", "www.vimeo.com"].includes(url.hostname)) {
    const id = url.pathname.split("/").filter(Boolean).at(-1);
    if (!id || !/^\d+$/.test(id)) throw new Error("That Vimeo link is not supported.");
    return { src: `https://player.vimeo.com/video/${id}`, kind: "embed" };
  }
  if (/\.(mp4|webm|mov)(?:$|\?)/i.test(url.href)) return { src: url.href, kind: "video" };
  throw new Error("Use a YouTube, Vimeo, MP4, WebM, or MOV HTTPS link.");
}

const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() { return { src: { default: null }, kind: { default: "embed" }, title: { default: "Lesson video" } }; },
  parseHTML() {
    return [
      { tag: "div[data-lesson-video]", getAttrs: (node) => ({ src: (node as HTMLElement).dataset.src, kind: "embed", title: (node as HTMLElement).dataset.title }) },
      { tag: "video[data-lesson-video]", getAttrs: (node) => ({ src: (node as HTMLVideoElement).src, kind: "video", title: (node as HTMLElement).dataset.title }) },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { src, kind, title } = HTMLAttributes;
    if (kind === "video") return ["video", mergeAttributes({ "data-lesson-video": "true", controls: "true", playsinline: "true", preload: "metadata", src, title, class: "lms-content-video" })];
    return ["div", mergeAttributes({ "data-lesson-video": "true", "data-src": src, "data-title": title, class: "lms-content-video-embed" }), ["iframe", { src, title, loading: "lazy", allow: "accelerometer; autoplay; encrypted-media; picture-in-picture", allowfullscreen: "true", referrerpolicy: "strict-origin-when-cross-origin" }]];
  },
});

const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      path: { default: null },
      name: { default: "Attached file" },
      size: { default: null },
    };
  },
  parseHTML() {
    return [{
      tag: "a[data-lms-file-path]",
      getAttrs: (node) => ({
        path: (node as HTMLElement).dataset.lmsFilePath,
        name: (node as HTMLElement).dataset.lmsFileName ?? (node as HTMLElement).textContent,
        size: (node as HTMLElement).dataset.lmsFileSize,
      }),
    }];
  },
  renderHTML({ HTMLAttributes }) {
    const name = String(HTMLAttributes.name || "Attached file");
    const size = HTMLAttributes.size ? ` · ${HTMLAttributes.size}` : "";
    return ["a", mergeAttributes({
      href: "#",
      class: "lms-file-attachment",
      "data-lms-file-path": HTMLAttributes.path,
      "data-lms-file-name": name,
      "data-lms-file-size": HTMLAttributes.size,
      title: `Open ${name}`,
    }), ["span", { "aria-hidden": "true" }, "↧"], ["strong", {}, name], ["small", {}, `Attached file${size}`]];
  },
});

const extensions = [
  StarterKit,
  VideoEmbed,
  FileAttachment,
  Image.configure({
    allowBase64: false,
    HTMLAttributes: { class: "lms-content-image" },
  }),
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
  onImageUpload,
  onVideoUpload,
  onFileUpload,
}: {
  value: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onVideoUpload?: (file: File) => Promise<string>;
  onFileUpload?: (file: File) => Promise<{ path: string; name: string; size: string }>;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState("");
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
  const insertVideo = () => {
    const entered = window.prompt("Paste a YouTube, Vimeo, MP4, WebM, or MOV HTTPS link");
    if (!entered) return;
    try {
      const video = safeVideoSource(entered.trim());
      editor.chain().focus().insertContent({ type: "videoEmbed", attrs: { ...video, title: "Embedded lesson video" } }).run();
      setMediaError("");
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "The video could not be embedded.");
    }
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
        {onImageUpload ? (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => imageInput.current?.click()}
            >
              {uploading ? "Uploading…" : "Images"}
            </button>
            <input
              ref={imageInput}
              className="lms-image-input"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                if (!files.length) return;
                setUploading(true);
                setMediaError("");
                void (async () => {
                  for (const file of files) {
                    const url = await onImageUpload(file);
                    editor.chain().focus().setImage({ src: url, alt: file.name, title: file.name }).run();
                  }
                })()
                  .catch((error: unknown) => setMediaError(error instanceof Error ? error.message : "Images could not be uploaded."))
                  .finally(() => setUploading(false));
              }}
            />
          </>
        ) : null}
        <button type="button" disabled={uploading} onClick={insertVideo}>Embed video</button>
        {onVideoUpload ? <>
          <button type="button" disabled={uploading} onClick={() => videoInput.current?.click()}>Upload video</button>
          <input ref={videoInput} className="lms-image-input" type="file" multiple accept="video/mp4,video/webm,video/quicktime" onChange={(event) => {
            const files=[...(event.target.files??[])]; event.target.value=""; if(!files.length) return;
            setUploading(true); setMediaError("");
            void (async()=>{for(const file of files){const src=await onVideoUpload(file);editor.chain().focus().insertContent({type:"videoEmbed",attrs:{src,kind:"video",title:file.name}}).run();}})().catch((error: unknown)=>setMediaError(error instanceof Error?error.message:"Video upload failed.")).finally(()=>setUploading(false));
          }} />
        </> : null}
        {onFileUpload ? <>
          <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>Attach files</button>
          <input ref={fileInput} className="lms-image-input" type="file" multiple onChange={(event) => {
            const files=[...(event.target.files??[])]; event.target.value=""; if(!files.length) return;
            setUploading(true); setMediaError("");
            void (async()=>{for(const file of files){const attachment=await onFileUpload(file);editor.chain().focus().insertContent({type:"fileAttachment",attrs:attachment}).run();}})().catch((error: unknown)=>setMediaError(error instanceof Error?error.message:"File upload failed.")).finally(()=>setUploading(false));
          }} />
        </> : null}
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
      {mediaError ? <p className="lms-media-error" role="alert">{mediaError}</p> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextContent({ html, onOpenFile }: { html: string; onOpenFile?: (path: string) => Promise<void> }) {
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
  return <div onClick={(event) => {
    const link=(event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-lms-file-path]");
    if(!link) return;
    event.preventDefault();
    const path=link.dataset.lmsFilePath;
    if(path && onOpenFile) void onOpenFile(path);
  }}><EditorContent editor={editor} /></div>;
}
