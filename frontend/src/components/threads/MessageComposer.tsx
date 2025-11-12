import React, { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import styled from "styled-components";
import { Send, Bold, Italic, List, ListOrdered } from "lucide-react";
import { color } from "../../theme/colors";
import { MentionPicker, MentionPickerRef } from "./MentionPicker";
import {
  ResourceMentionPicker,
  ResourceMentionPickerRef,
  MentionResource,
} from "./ResourceMentionPicker";
import { useMentionUsers } from "./hooks/useMentionUsers";
import { useResourceMentionSearch } from "./hooks/useResourceMentionSearch";

const ComposerContainer = styled.div`
  display: flex;
  flex-direction: column;
  border: 2px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  background: white;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;

  &:focus-within {
    border-color: ${color.B5};
    box-shadow: 0 6px 24px rgba(74, 144, 226, 0.15), 0 2px 8px rgba(74, 144, 226, 0.1);
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid ${({ theme }) => color.N4};
  background: ${({ theme }) => color.N2};
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
    $isActive ? color.N3 : "transparent"};
  color: ${({ theme }) => color.N10};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => color.N3};
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
      color: ${({ theme }) => color.N6};
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

    /* Mention styling */
    .mention {
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
      font-size: 0.95em;
    }

    .mention-user {
      background-color: ${({ theme }) => color.B2};
      color: ${({ theme }) => color.B8};
    }

    .mention-resource {
      background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
      color: ${({ theme }) => color.P8};
      border: 1px solid ${({ theme }) => color.P4};
    }
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid ${({ theme }) => color.N4};
  background: ${({ theme }) => color.N2};
`;

const CharacterCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => color.N6};
`;

const SendButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, ${color.B6} 0%, ${color.B5} 100%);
  color: white;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(74, 144, 226, 0.35);
  letter-spacing: -0.01em;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(74, 144, 226, 0.45);
    background: linear-gradient(135deg, #5a7ee2 0%, #4a90e2 100%);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(74, 144, 226, 0.3);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
    box-shadow: 0 2px 6px rgba(74, 144, 226, 0.2);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ErrorMessage = styled.div`
  padding: 8px 12px;
  background: ${({ theme }) => color.R7}15;
  color: ${({ theme }) => color.R7};
  font-size: 13px;
  border-top: 1px solid ${({ theme }) => color.R7}40;
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
  /** Enable @ mentions for users (default: true) */
  enableMentions?: boolean;
  /** Enable @ mentions for resources (corpus/document) (default: true) */
  enableResourceMentions?: boolean;
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
  enableMentions = true,
  enableResourceMentions = true,
}: MessageComposerProps) {
  const [resourceSearchQuery, setResourceSearchQuery] = React.useState("");
  const [characterCount, setCharacterCount] = React.useState(0);
  const { resources } = useResourceMentionSearch(resourceSearchQuery);
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
      ...(enableMentions
        ? [
            Mention.configure({
              HTMLAttributes: {
                class: "mention mention-user",
              },
              suggestion: {
                char: "@",
                items: ({ query }: { query: string }) => {
                  // User mentions - handled by suggestion plugin
                  return [];
                },
                render: () => {
                  let component: ReactRenderer<MentionPickerRef> | null = null;
                  let popup: HTMLDivElement | null = null;

                  const updatePosition = (props: any) => {
                    if (!popup || !props.clientRect) return;

                    const virtualReference = {
                      getBoundingClientRect: props.clientRect,
                    };

                    computePosition(virtualReference, popup, {
                      placement: "bottom-start",
                      middleware: [offset(8), flip(), shift({ padding: 8 })],
                    }).then(({ x, y }) => {
                      Object.assign(popup!.style, {
                        left: `${x}px`,
                        top: `${y}px`,
                      });
                    });
                  };

                  return {
                    onStart: (props: any) => {
                      component = new ReactRenderer(MentionPicker, {
                        props: {
                          ...props,
                          users: [],
                        },
                        editor: props.editor,
                      });

                      if (!props.clientRect) {
                        return;
                      }

                      popup = document.createElement("div");
                      popup.style.position = "absolute";
                      popup.style.zIndex = "9999";
                      popup.appendChild(component.element);
                      document.body.appendChild(popup);

                      updatePosition(props);
                    },

                    onUpdate(props: any) {
                      component?.updateProps({
                        ...props,
                        users: [],
                      });

                      updatePosition(props);
                    },

                    onKeyDown(props: any) {
                      if (props.event.key === "Escape") {
                        return true;
                      }

                      return component?.ref?.onKeyDown(props) ?? false;
                    },

                    onExit() {
                      popup?.remove();
                      component?.destroy();
                    },
                  };
                },
              },
            }),
          ]
        : []),
      ...(enableResourceMentions
        ? [
            Mention.extend({ name: "resourceMention" }).configure({
              HTMLAttributes: {
                class: "mention mention-resource",
              },
              suggestion: {
                char: "@",
                items: ({ query }: { query: string }) => {
                  // Trigger resource search
                  setResourceSearchQuery(query);
                  return resources;
                },
                render: () => {
                  let component: ReactRenderer<ResourceMentionPickerRef> | null =
                    null;
                  let popup: HTMLDivElement | null = null;

                  const updatePosition = (props: any) => {
                    if (!popup || !props.clientRect) return;

                    const virtualReference = {
                      getBoundingClientRect: props.clientRect,
                    };

                    computePosition(virtualReference, popup, {
                      placement: "bottom-start",
                      middleware: [offset(8), flip(), shift({ padding: 8 })],
                    }).then(({ x, y }) => {
                      Object.assign(popup!.style, {
                        left: `${x}px`,
                        top: `${y}px`,
                      });
                    });
                  };

                  return {
                    onStart: (props: any) => {
                      // Check if query starts with "corpus:" or "document:"
                      const query = props.query || "";
                      if (
                        !query.startsWith("corpus:") &&
                        !query.startsWith("document:")
                      ) {
                        return; // Let user mention handle it
                      }

                      component = new ReactRenderer(ResourceMentionPicker, {
                        props: {
                          ...props,
                          resources: resources,
                          onSelect: (resource: MentionResource) => {
                            // Generate mention format
                            let mentionText = "";
                            if (resource.type === "corpus") {
                              mentionText = `@corpus:${resource.slug}`;
                            } else if (resource.corpus) {
                              mentionText = `@corpus:${resource.corpus.slug}/document:${resource.slug}`;
                            } else {
                              mentionText = `@document:${resource.slug}`;
                            }

                            // Insert the mention
                            props.command({
                              id: resource.id,
                              label: mentionText,
                            });
                          },
                        },
                        editor: props.editor,
                      });

                      if (!props.clientRect) {
                        return;
                      }

                      popup = document.createElement("div");
                      popup.style.position = "absolute";
                      popup.style.zIndex = "9999";
                      popup.appendChild(component.element);
                      document.body.appendChild(popup);

                      updatePosition(props);
                    },

                    onUpdate(props: any) {
                      const query = props.query || "";
                      if (
                        !query.startsWith("corpus:") &&
                        !query.startsWith("document:")
                      ) {
                        // Close if not a resource mention
                        popup?.remove();
                        component?.destroy();
                        return;
                      }

                      component?.updateProps({
                        ...props,
                        resources: resources,
                      });

                      updatePosition(props);
                    },

                    onKeyDown(props: any) {
                      if (props.event.key === "Escape") {
                        return true;
                      }

                      return component?.ref?.onKeyDown(props) ?? false;
                    },

                    onExit() {
                      popup?.remove();
                      component?.destroy();
                    },
                  };
                },
              },
            }),
          ]
        : []),
    ],
    content: initialContent,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      setCharacterCount(text.length);
      onChange?.(editor.getHTML());
    },
  });

  // Update editor content when initialContent changes
  useEffect(() => {
    if (!editor || !initialContent) return;

    try {
      if (editor.getHTML() !== initialContent) {
        editor.commands.setContent(initialContent);
        setCharacterCount(editor.getText().length);
      }
    } catch (err) {
      console.debug("Editor not ready for content update, will retry");
    }
  }, [editor, initialContent]);

  // Initialize character count when editor is created
  useEffect(() => {
    if (!editor) return;

    try {
      setCharacterCount(editor.getText().length);
    } catch (err) {
      console.debug("Editor not ready for character count, will retry");
    }
  }, [editor]);

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
      setCharacterCount(0);
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
    if (!editor) return;

    try {
      // TipTap's view.dom getter throws if editor isn't fully mounted
      const editorElement = editor.view?.dom;
      if (editorElement) {
        editorElement.addEventListener("keydown", handleKeyDown as any);
        return () => {
          editorElement.removeEventListener("keydown", handleKeyDown as any);
        };
      }
    } catch (err) {
      // Editor not fully mounted yet, will retry on next render
      console.debug("Editor view not ready yet, skipping keydown listener");
    }
  }, [editor, handleKeyDown]);

  if (!editor) {
    return null;
  }

  // Use state-based character count for reactivity
  let isEmpty = characterCount === 0;
  let isOverLimit = characterCount > maxLength;

  // Safely check if editor has content (TipTap might not be ready yet)
  try {
    isEmpty = characterCount === 0 || !editor.getText().trim();
  } catch (err) {
    // Editor not fully mounted, default to empty
    isEmpty = true;
  }

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
