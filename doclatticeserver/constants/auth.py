"""
Authentication-related constants.
"""

# Number of characters to show when logging token prefixes for debugging
TOKEN_LOG_PREFIX_LENGTH = 10

# Cache TTL for admin claims sync (in seconds)
# Admin claims are synced from Auth0 tokens periodically to balance security
# and performance. This TTL controls how often claims are re-synced.
# 5 minutes = 300 seconds
ADMIN_CLAIMS_CACHE_TTL = 300
