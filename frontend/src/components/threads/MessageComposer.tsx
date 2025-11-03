import React, { useCallback, useEffect } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import styled from "styled-components";
import { Send, Bold, Italic, List, ListOrdered } from "lucide-react";

const ComposerContainer = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.color.borders.tertiary};
  border-radius: 8px;
  background: ${({ theme }) => theme.color.background.primary};
  overflow: hidden;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.color.borders.tertiary};
  background: ${({ theme }) => theme.color.background.secondary};
`;

const ToolbarButton = styled.button<{ $isActive?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: ${({ $isActive, theme }) =>
    $isActive ? theme.color.background.tertiary : "transparent"};
  color: ${({ theme }) => theme.color.text.primary};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.background.tertiary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const EditorContainer = styled.div`
  flex: 1;
  padding: 12px;
  min-height: 120px;
  max-height: 400px;
  overflow-y: auto;

  .ProseMirror {
    outline: none;
    min-height: 96px;

    p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      color: ${({ theme }) => theme.color.text.tertiary};
      pointer-events: none;
      height: 0;
    }

    p {
      margin: 0 0 8px 0;

      &:last-child {
        margin-bottom: 0;
      }
    }

    ul,
    ol {
      padding-left: 24px;
      margin: 8px 0;
    }

    strong {
      font-weight: 600;
    }

    em {
      font-style: italic;
    }
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid ${({ theme }) => theme.color.borders.tertiary};
  background: ${({ theme }) => theme.color.background.secondary};
`;

const CharacterCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.text.tertiary};
`;

const SendButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: ${({ theme }) => theme.color.primary};
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ErrorMessage = styled.div`
  padding: 8px 12px;
  background: ${({ theme }) => theme.color.error}15;
  color: ${({ theme }) => theme.color.error};
  font-size: 13px;
  border-top: 1px solid ${({ theme }) => theme.color.error}40;
`;

export interface MessageComposerProps {
  /** Placeholder text for empty editor */
  placeholder?: string;
  /** Initial content (HTML string) */
  initialContent?: string;
  /** Maximum character count (default: 10000) */
  maxLength?: number;
  /** Called when user submits message */
  onSubmit: (content: string) => void | Promise<void>;
  /** Called when content changes */
  onChange?: (content: string) => void;
  /** Disable the composer (e.g., while submitting) */
  disabled?: boolean;
  /** Error message to display */
  error?: string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

export function MessageComposer({
  placeholder = "Write your message...",
  initialContent = "",
  maxLength = 10000,
  onSubmit,
  onChange,
  disabled = false,
  error,
  autoFocus = false,
}: MessageComposerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable code blocks and blockquotes for simpler UX
        codeBlock: false,
        blockquote: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: initialContent,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // Update editor content when initialContent changes
  useEffect(() => {
    if (editor && initialContent && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  // Update editor editable state when disabled changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  // Auto-focus
  useEffect(() => {
    if (editor && autoFocus) {
      editor.commands.focus();
    }
  }, [editor, autoFocus]);

  const handleSubmit = useCallback(async () => {
    if (!editor || disabled) return;

    const content = editor.getHTML();
    const text = editor.getText();

    // Validate
    if (!text.trim()) {
      return;
    }

    if (text.length > maxLength) {
      return;
    }

    try {
      await onSubmit(content);
      // Clear editor on success
      editor.commands.clearContent();
    } catch (err) {
      // Parent component handles error display
      console.error("Failed to submit message:", err);
    }
  }, [editor, disabled, maxLength, onSubmit]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Submit on Cmd/Ctrl+Enter
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  useEffect(() => {
    const editorElement = editor?.view.dom;
    if (editorElement) {
      editorElement.addEventListener("keydown", handleKeyDown as any);
      return () => {
        editorElement.removeEventListener("keydown", handleKeyDown as any);
      };
    }
  }, [editor, handleKeyDown]);

  if (!editor) {
    return null;
  }

  const characterCount = editor.getText().length;
  const isEmpty = !editor.getText().trim();
  const isOverLimit = characterCount > maxLength;

  return (
    <ComposerContainer>
      <Toolbar>
        <ToolbarButton
          $isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
          title="Bold (Cmd+B)"
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          $isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
          title="Italic (Cmd+I)"
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          $isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          title="Bullet List"
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          $isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          title="Numbered List"
        >
          <ListOrdered />
        </ToolbarButton>
      </Toolbar>

      <EditorContainer>
        <EditorContent editor={editor} />
      </EditorContainer>

      <Footer>
        <CharacterCount>
          {characterCount} / {maxLength}
          {isOverLimit && " (too long)"}
        </CharacterCount>
        <SendButton
          onClick={handleSubmit}
          disabled={disabled || isEmpty || isOverLimit}
          title="Send (Cmd+Enter)"
        >
          <Send />
          Send
        </SendButton>
      </Footer>

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </ComposerContainer>
  );
}
