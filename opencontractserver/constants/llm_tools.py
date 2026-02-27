"""
Constants for LLM agent tool functions.

These values control truncation, default parameters, and display limits
used by the core tool functions in ``opencontractserver.llms.tools``.
"""

# Maximum characters of note content included in list/summary responses.
# Keeps tool output compact when returning multiple notes.
NOTE_CONTENT_PREVIEW_LENGTH = 512

# Default end index for partial content retrieval (get_partial_note_content).
DEFAULT_PARTIAL_CONTENT_END = 500

# Default DPI for rendering PDF pages as images (get_page_image / aget_page_image).
# Higher values produce better quality but larger base64 payloads.
DEFAULT_PAGE_IMAGE_DPI = 150

# Maximum length for titles in generated markdown links.
# Titles exceeding this limit are truncated with an ellipsis ("...").
MARKDOWN_LINK_TITLE_MAX_LENGTH = 100
