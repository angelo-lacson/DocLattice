"""
Validation utility functions for GraphQL mutations.

This module exists to avoid circular imports between mutation modules.
"""

import re

# Regex pattern for validating hex color codes (3, 4, 6, or 8 hex digits with #)
HEX_COLOR_PATTERN = r"^#(?:[0-9a-fA-F]{3}){1,2}$|^#(?:[0-9a-fA-F]{4}){1,2}$"


def validate_color(color: str | None) -> tuple[bool, str | None]:
    """
    Validate that a color string is a valid hex color code.

    Accepts: #RGB, #RRGGBB, #RGBA, #RRGGBBAA formats

    Args:
        color: Color string to validate (can be None)

    Returns:
        Tuple of (is_valid, error_message).
        If valid or None, returns (True, None).
        If invalid, returns (False, error_message).
    """
    if color is None:
        return True, None

    if not isinstance(color, str):
        return False, "Color must be a string"

    if not re.match(HEX_COLOR_PATTERN, color):
        return (
            False,
            f"Invalid color format '{color}'. Expected hex format: #RGB, #RRGGBB, #RGBA, or #RRGGBBAA",
        )

    return True, None
