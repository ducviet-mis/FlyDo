"use client";

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Heading2, Heading3, Quote, ImageIcon, LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Image,
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: 'Bắt đầu viết nội dung ở đây...',
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose vivux-prose max-w-none min-h-[400px] px-4 py-4',
        'aria-label': 'Nội dung bài viết',
      },
    },
  });

  if (!editor) {
    return null;
  }

  const addImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { uploadHandbookImage } = await import('@/features/handbook/utils/upload');
      const url = await uploadHandbookImage(file);
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Nhập đường dẫn liên kết:', previousUrl);

    if (url === null) {
      return; // cancelled
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="border border-control rounded-xl overflow-hidden bg-card focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-2 focus-within:ring-offset-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="In đậm" aria-pressed={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn("h-11 w-11 p-0", editor.isActive('bold') && "bg-muted text-primary font-bold")}
        >
          <Bold className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="In nghiêng" aria-pressed={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn("h-11 w-11 p-0", editor.isActive('italic') && "bg-muted text-primary")}
        >
          <Italic className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={cn("h-11 px-3 font-bold", editor.isActive('heading', { level: 2 }) && "bg-muted text-primary")}
        >
          H2
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={cn("h-11 px-3 font-semibold", editor.isActive('heading', { level: 3 }) && "bg-muted text-primary")}
        >
          H3
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Trích dẫn" aria-pressed={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={cn("h-11 w-11 p-0", editor.isActive('blockquote') && "bg-muted text-primary")}
        >
          <Quote className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Chèn liên kết" onClick={setLink}
          className={cn("h-11 w-11 p-0", editor.isActive('link') && "bg-muted text-primary")}
        >
          <LinkIcon className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Chèn ảnh" onClick={addImage}
          disabled={isUploading}
          className="h-11 w-11 p-0"
        >
          {isUploading ? <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" /> : <ImageIcon className="w-4 h-4" />}
        </Button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Editor Content */}
      <EditorContent editor={editor} />

      <style jsx global>{`
        .ProseMirror {
          outline: none !important;
          box-shadow: none !important;
        }
        .ProseMirror:focus {
          outline: none !important;
          box-shadow: none !important;
          border: none !important;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgb(var(--color-text-secondary));
          pointer-events: none;
          height: 0;
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: var(--radius-md);
          margin: 1.5rem auto;
          display: block;
        }
        .ProseMirror blockquote {
          border-left: 3px solid rgb(var(--color-special));
          padding-left: 1rem;
          margin-left: 0;
          margin-right: 0;
          font-style: italic;
          color: rgb(var(--color-text-secondary));
        }
      `}</style>
    </div>
  );
}
