import React, { useState, useEffect, useRef, useCallback } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Search, X, Loader2, Globe, Folder } from "lucide-react";
import {
  useAgentMentionSearch,
  AgentMentionResource,
} from "../../threads/hooks/useAgentMentionSearch";

// Styled Components
const Container = styled.div`
  position: relative;
  width: 100%;
`;

const PickerTrigger = styled.button<{ $isOpen: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border: 1.5px solid ${(props) => (props.$isOpen ? "#3b82f6" : "#e2e8f0")};
  border-radius: 6px;
  font-size: 0.8125rem;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #64748b;
  font-weight: 500;

  &:hover:not(:disabled) {
    border-color: ${(props) => (props.$isOpen ? "#3b82f6" : "#cbd5e1")};
    background: ${(props) => (props.$isOpen ? "white" : "#fafbfc")};
    color: #3b82f6;
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  &:disabled {
    background: #f8fafc;
    cursor: not-allowed;
    opacity: 0.6;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const DropdownContainer = styled(motion.div)`
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  min-width: 280px;
  max-width: 360px;
  background: white;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.12);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const SearchInputWrapper = styled.div`
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  position: relative;
`;

const StyledSearchInput = styled.input`
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 2.25rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  transition: all 0.2s ease;
  background: #fafbfc;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background: white;
  }

  &::placeholder {
    color: #94a3b8;
  }
`;

const SearchIconWrapper = styled.div`
  position: absolute;
  left: 1.25rem;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  pointer-events: none;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 1.25rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #64748b;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background: #e2e8f0;
    color: #475569;
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const OptionsContainer = styled.div`
  max-height: 240px;
  overflow-y: auto;
  padding: 0.5rem;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 2px;

    &:hover {
      background: #cbd5e1;
    }
  }
`;

const SectionLabel = styled.div`
  font-size: 0.6875rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.5rem;
  margin-top: 0.25rem;

  &:first-child {
    margin-top: 0;
  }
`;

const Option = styled(motion.button)<{ $isHighlighted?: boolean }>`
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: none;
  background: ${(props) => (props.$isHighlighted ? "#f1f5f9" : "none")};
  cursor: pointer;
  text-align: left;
  border-radius: 6px;
  transition: all 0.15s ease;
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  font-size: 0.875rem;

  &:hover {
    background: #f1f5f9;
  }

  &:focus {
    outline: none;
    background: #e0f2fe;
  }
`;

const AgentIcon = styled.div<{ $scope: "GLOBAL" | "CORPUS" }>`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: ${(props) =>
    props.$scope === "GLOBAL"
      ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"
      : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)"};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 16px;
    height: 16px;
    color: white;
  }
`;

const OptionContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const OptionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const OptionName = styled.div`
  font-weight: 500;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ScopeBadge = styled.span<{ $scope: "GLOBAL" | "CORPUS" }>`
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  background: ${(props) => (props.$scope === "GLOBAL" ? "#dbeafe" : "#ede9fe")};
  color: ${(props) => (props.$scope === "GLOBAL" ? "#2563eb" : "#7c3aed")};
  display: flex;
  align-items: center;
  gap: 0.25rem;

  svg {
    width: 10px;
    height: 10px;
  }
`;

const OptionMention = styled.div`
  font-size: 0.75rem;
  color: #64748b;
  font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace;
  margin-top: 0.125rem;
`;

const OptionDescription = styled.div`
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  color: #64748b;
  font-size: 0.875rem;
  gap: 0.75rem;
`;

const EmptyState = styled.div`
  padding: 2rem 1rem;
  text-align: center;
  color: #64748b;
  font-size: 0.8125rem;
  line-height: 1.4;
`;

const SpinningLoader = styled(Loader2)`
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

// Animation variants
const dropdownVariants = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 500,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.98,
    transition: {
      duration: 0.15,
    },
  },
};

export interface AgentMentionPickerProps {
  /** Optional corpus ID to include corpus-scoped agents */
  corpusId?: string;
  /** Callback when an agent is selected */
  onSelect: (agent: AgentMentionResource) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Custom trigger button text */
  triggerText?: string;
}

/**
 * AgentMentionPicker - A dropdown picker for selecting agents to mention
 *
 * Used in chat interfaces to allow users to @mention agents.
 * Shows both global agents and corpus-scoped agents (if corpusId provided).
 *
 * Part of Issue #623 - @ Mentions Feature (Extended) - Agent Mentions
 */
export function AgentMentionPicker({
  corpusId,
  onSelect,
  disabled = false,
  triggerText = "@ Mention Agent",
}: AgentMentionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { agents, loading, hasResults } = useAgentMentionSearch(
    searchQuery,
    corpusId
  );

  // Separate agents by scope
  const globalAgents = agents.filter((a) => a.scope === "GLOBAL");
  const corpusAgents = agents.filter((a) => a.scope === "CORPUS");
  const allAgents = [...globalAgents, ...corpusAgents];

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlightedIndex((prev) =>
            prev < allAgents.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          event.preventDefault();
          if (allAgents[highlightedIndex]) {
            handleSelectAgent(allAgents[highlightedIndex]);
          }
          break;
        case "Escape":
          event.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, allAgents, highlightedIndex]
  );

  const handleSelectAgent = (agent: AgentMentionResource) => {
    onSelect(agent);
    setIsOpen(false);
  };

  const toggleOpen = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <Container ref={containerRef} onKeyDown={handleKeyDown}>
      <PickerTrigger
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        $isOpen={isOpen}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Bot />
        {triggerText}
      </PickerTrigger>

      <AnimatePresence>
        {isOpen && (
          <DropdownContainer
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="listbox"
          >
            <SearchInputWrapper>
              <SearchIconWrapper>
                <Search />
              </SearchIconWrapper>
              <StyledSearchInput
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents..."
                aria-label="Search agents"
              />
              {searchQuery && (
                <ClearButton
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  <X />
                </ClearButton>
              )}
            </SearchInputWrapper>

            <OptionsContainer>
              {loading ? (
                <LoadingContainer>
                  <SpinningLoader size={18} />
                  Searching agents...
                </LoadingContainer>
              ) : !hasResults ? (
                <EmptyState>
                  {searchQuery
                    ? `No agents found matching "${searchQuery}"`
                    : "No agents available"}
                </EmptyState>
              ) : (
                <>
                  {globalAgents.length > 0 && (
                    <>
                      <SectionLabel>Global Agents</SectionLabel>
                      {globalAgents.map((agent, index) => (
                        <Option
                          key={agent.id}
                          onClick={() => handleSelectAgent(agent)}
                          $isHighlighted={highlightedIndex === index}
                          role="option"
                          aria-selected={highlightedIndex === index}
                        >
                          <AgentIcon $scope="GLOBAL">
                            <Bot />
                          </AgentIcon>
                          <OptionContent>
                            <OptionHeader>
                              <OptionName>{agent.name}</OptionName>
                              <ScopeBadge $scope="GLOBAL">
                                <Globe />
                                Global
                              </ScopeBadge>
                            </OptionHeader>
                            <OptionMention>{agent.mentionFormat}</OptionMention>
                            {agent.description && (
                              <OptionDescription>
                                {agent.description}
                              </OptionDescription>
                            )}
                          </OptionContent>
                        </Option>
                      ))}
                    </>
                  )}

                  {corpusAgents.length > 0 && (
                    <>
                      <SectionLabel>Corpus Agents</SectionLabel>
                      {corpusAgents.map((agent, index) => (
                        <Option
                          key={agent.id}
                          onClick={() => handleSelectAgent(agent)}
                          $isHighlighted={
                            highlightedIndex === globalAgents.length + index
                          }
                          role="option"
                          aria-selected={
                            highlightedIndex === globalAgents.length + index
                          }
                        >
                          <AgentIcon $scope="CORPUS">
                            <Bot />
                          </AgentIcon>
                          <OptionContent>
                            <OptionHeader>
                              <OptionName>{agent.name}</OptionName>
                              <ScopeBadge $scope="CORPUS">
                                <Folder />
                                Corpus
                              </ScopeBadge>
                            </OptionHeader>
                            <OptionMention>{agent.mentionFormat}</OptionMention>
                            {agent.description && (
                              <OptionDescription>
                                {agent.description}
                              </OptionDescription>
                            )}
                            {agent.corpus && (
                              <OptionDescription>
                                in {agent.corpus.title}
                              </OptionDescription>
                            )}
                          </OptionContent>
                        </Option>
                      ))}
                    </>
                  )}
                </>
              )}
            </OptionsContainer>
          </DropdownContainer>
        )}
      </AnimatePresence>
    </Container>
  );
}

export default AgentMentionPicker;
