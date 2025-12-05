"""
Central registry of all available tools for agent configurations.

This module provides a structured listing of all tools that can be assigned
to agents, including their metadata, descriptions, and categorization.
"""

from dataclasses import dataclass
from enum import Enum


class ToolCategory(str, Enum):
    """Categories for agent tools."""

    SEARCH = "search"
    DOCUMENT = "document"
    CORPUS = "corpus"
    NOTES = "notes"
    ANNOTATIONS = "annotations"
    COORDINATION = "coordination"


@dataclass(frozen=True)
class ToolDefinition:
    """Definition of an available tool for agents."""

    name: str
    description: str
    category: ToolCategory
    requires_corpus: bool = False
    requires_approval: bool = False
    parameters: tuple[tuple[str, str, bool], ...] = ()  # (name, description, required)

    def to_dict(self) -> dict:
        """Convert to dictionary for GraphQL response."""
        return {
            "name": self.name,
            "description": self.description,
            "category": self.category.value,
            "requires_corpus": self.requires_corpus,
            "requires_approval": self.requires_approval,
            "parameters": [
                {"name": p[0], "description": p[1], "required": p[2]}
                for p in self.parameters
            ],
        }


# =============================================================================
# AVAILABLE TOOLS REGISTRY
# =============================================================================

AVAILABLE_TOOLS: tuple[ToolDefinition, ...] = (
    # -------------------------------------------------------------------------
    # SEARCH TOOLS
    # -------------------------------------------------------------------------
    ToolDefinition(
        name="similarity_search",
        description=(
            "Search for semantically similar content using vector embeddings. "
            "Returns relevant passages from annotations with similarity scores."
        ),
        category=ToolCategory.SEARCH,
        parameters=(
            ("query", "The search query text", True),
            ("k", "Number of results to return (default 5)", False),
        ),
    ),
    ToolDefinition(
        name="search_exact_text",
        description=(
            "Find exact text matches in a document and return them as source nodes "
            "with page numbers and bounding boxes. Essential for creating proper citations."
        ),
        category=ToolCategory.SEARCH,
        parameters=(
            (
                "search_strings",
                "List of exact strings to find (all occurrences will be found)",
                True,
            ),
        ),
    ),
    # -------------------------------------------------------------------------
    # DOCUMENT TOOLS
    # -------------------------------------------------------------------------
    ToolDefinition(
        name="load_document_summary",
        description=(
            "Load the markdown summary of a document. Optionally truncate by length "
            "and direction (from start or end)."
        ),
        category=ToolCategory.DOCUMENT,
        parameters=(
            ("truncate_length", "Optional number of characters to truncate to", False),
            ("from_start", "If True, truncate from start; if False, from end", False),
        ),
    ),
    ToolDefinition(
        name="get_summary_token_length",
        description="Get the approximate token length of a document's markdown summary.",
        category=ToolCategory.DOCUMENT,
    ),
    ToolDefinition(
        name="get_document_text_length",
        description=(
            "Get the total character length of the document's plain-text extract. "
            "Use this BEFORE loading text to plan your chunking strategy."
        ),
        category=ToolCategory.DOCUMENT,
    ),
    ToolDefinition(
        name="load_document_text",
        description=(
            "Load a slice of the document's plain-text extract. Always use "
            "get_document_text_length first to plan chunking. Load in chunks of "
            "5K-50K chars to avoid context overflow. After reading, call "
            "search_exact_text on key passages to create citations."
        ),
        category=ToolCategory.DOCUMENT,
        parameters=(
            ("start", "Inclusive start character index (default 0)", False),
            ("end", "Exclusive end character index (defaults to end of file)", False),
            ("refresh", "If true, refresh the cached content from disk", False),
        ),
    ),
    ToolDefinition(
        name="get_page_image",
        description=(
            "Get a visual image of a specific page from a PDF document as base64. "
            "Useful for inspecting diagrams, tables, images, and other visual content."
        ),
        category=ToolCategory.DOCUMENT,
        parameters=(
            ("page_number", "The page number to render (1-indexed)", True),
            ("image_format", "Image format: 'jpeg' or 'png' (default 'jpeg')", False),
            ("dpi", "Resolution in DPI (default 150)", False),
        ),
    ),
    # -------------------------------------------------------------------------
    # DOCUMENT SUMMARY VERSIONING TOOLS
    # -------------------------------------------------------------------------
    ToolDefinition(
        name="get_document_summary",
        description=(
            "Get the latest summary content for a document in a specific corpus."
        ),
        category=ToolCategory.DOCUMENT,
        requires_corpus=True,
        parameters=(
            ("truncate_length", "Optional max characters to return", False),
            ("from_start", "If True truncate from beginning, else from end", False),
        ),
    ),
    ToolDefinition(
        name="get_document_summary_versions",
        description="Get the version history for a document's summaries in a corpus.",
        category=ToolCategory.DOCUMENT,
        requires_corpus=True,
        parameters=(
            ("limit", "Maximum number of versions to return (most recent first)", False),
        ),
    ),
    ToolDefinition(
        name="get_document_summary_diff",
        description="Get the diff between two summary versions.",
        category=ToolCategory.DOCUMENT,
        requires_corpus=True,
        parameters=(
            ("from_version", "Starting version number", True),
            ("to_version", "Ending version number", True),
        ),
    ),
    ToolDefinition(
        name="update_document_summary",
        description=(
            "Create a new summary revision for a document. "
            "Returns version information about the created revision."
        ),
        category=ToolCategory.DOCUMENT,
        requires_corpus=True,
        requires_approval=True,
        parameters=(("new_content", "The new summary content", True),),
    ),
    # -------------------------------------------------------------------------
    # NOTES TOOLS
    # -------------------------------------------------------------------------
    ToolDefinition(
        name="get_document_notes",
        description=(
            "Retrieve all notes attached to a document in the current corpus. "
            "Returns metadata and first 512-char preview of each note."
        ),
        category=ToolCategory.NOTES,
        requires_corpus=True,
    ),
    ToolDefinition(
        name="search_document_notes",
        description=(
            "Search notes by title or content (case-insensitive). "
            "Returns matching notes for a document."
        ),
        category=ToolCategory.NOTES,
        parameters=(
            ("search_term", "Text to search for in title or content", True),
            ("limit", "Maximum number of notes to return", False),
        ),
    ),
    ToolDefinition(
        name="add_document_note",
        description="Create a new note attached to a document.",
        category=ToolCategory.NOTES,
        requires_approval=True,
        parameters=(
            ("title", "Note title", True),
            ("content", "Note content", True),
        ),
    ),
    ToolDefinition(
        name="update_document_note",
        description=(
            "Update an existing note, creating a new revision. "
            "Provide either new_content or diff_text (ndiff format)."
        ),
        category=ToolCategory.NOTES,
        requires_approval=True,
        parameters=(
            ("note_id", "ID of the note to update", True),
            ("new_content", "Full new content (mutually exclusive with diff_text)", False),
            ("diff_text", "ndiff format diff to apply (mutually exclusive with new_content)", False),
        ),
    ),
    # -------------------------------------------------------------------------
    # CORPUS TOOLS
    # -------------------------------------------------------------------------
    ToolDefinition(
        name="get_corpus_description",
        description="Retrieve the latest markdown description for this corpus.",
        category=ToolCategory.CORPUS,
        requires_corpus=True,
        parameters=(
            ("truncate_length", "Optionally truncate to this many characters", False),
            ("from_start", "If true, truncate from beginning else from end", False),
        ),
    ),
    ToolDefinition(
        name="update_corpus_description",
        description=(
            "Update corpus description with new markdown text, creating a revision if changed."
        ),
        category=ToolCategory.CORPUS,
        requires_corpus=True,
        requires_approval=True,
        parameters=(("new_content", "Full markdown content", True),),
    ),
    # -------------------------------------------------------------------------
    # COORDINATION TOOLS (for corpus agents)
    # -------------------------------------------------------------------------
    ToolDefinition(
        name="list_documents",
        description=(
            "List all documents in the current corpus with their IDs, titles, and descriptions. "
            "Use this to decide which document to query with ask_document."
        ),
        category=ToolCategory.COORDINATION,
        requires_corpus=True,
    ),
    ToolDefinition(
        name="ask_document",
        description=(
            "Ask a question to a document-specific agent within this corpus. "
            "The sub-agent has full access to document tools (search, summary, notes, etc.)."
        ),
        category=ToolCategory.COORDINATION,
        requires_corpus=True,
        parameters=(
            ("document_id", "ID of the target document (must belong to this corpus)", True),
            ("question", "The natural-language question to forward", True),
        ),
    ),
    # -------------------------------------------------------------------------
    # ANNOTATION TOOLS
    # -------------------------------------------------------------------------
    ToolDefinition(
        name="duplicate_annotations_with_label",
        description=(
            "Duplicate existing annotations with a new label. "
            "Creates copies of annotations with the specified label applied."
        ),
        category=ToolCategory.ANNOTATIONS,
        requires_corpus=True,
        requires_approval=True,
        parameters=(
            ("annotation_ids", "List of annotation IDs to duplicate", True),
            ("new_label_text", "Text of the label to apply to duplicates", True),
            ("label_type", "Optional label type (defaults to TOKEN_LABEL)", False),
        ),
    ),
    ToolDefinition(
        name="add_annotations_from_exact_strings",
        description=(
            "Create annotations for exact string matches in documents. "
            "For PDFs: creates token-level annotations. For text: creates span annotations."
        ),
        category=ToolCategory.ANNOTATIONS,
        requires_corpus=True,
        requires_approval=True,
        parameters=(
            (
                "items",
                "List of (label_text, exact_string, document_id, corpus_id) tuples",
                True,
            ),
        ),
    ),
)


def get_all_tools() -> list[dict]:
    """Get all available tools as a list of dictionaries."""
    return [tool.to_dict() for tool in AVAILABLE_TOOLS]


def get_tools_by_category(category: str) -> list[dict]:
    """Get tools filtered by category."""
    try:
        cat = ToolCategory(category)
    except ValueError:
        return []
    return [tool.to_dict() for tool in AVAILABLE_TOOLS if tool.category == cat]


def get_tool_by_name(name: str) -> dict | None:
    """Get a single tool by name."""
    for tool in AVAILABLE_TOOLS:
        if tool.name == name:
            return tool.to_dict()
    return None


def get_tool_names() -> list[str]:
    """Get just the names of all available tools."""
    return [tool.name for tool in AVAILABLE_TOOLS]


def validate_tool_names(names: list[str]) -> tuple[list[str], list[str]]:
    """
    Validate a list of tool names against the registry.

    Returns:
        Tuple of (valid_names, invalid_names)
    """
    valid_names = get_tool_names()
    valid = [n for n in names if n in valid_names]
    invalid = [n for n in names if n not in valid_names]
    return valid, invalid
