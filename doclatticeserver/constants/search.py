"""
Constants for vector search, full-text search, and hybrid search operations.
"""

# =============================================================================
# HNSW Index Parameters
# =============================================================================
# These control the quality vs. speed tradeoff for approximate nearest neighbor
# search. See: https://github.com/pgvector/pgvector#hnsw

# Connections per node in the HNSW graph.
# Higher = better recall but more memory and slower builds.
# 16 is the pgvector default and works well up to ~10M vectors.
HNSW_M = 16

# Build-time quality parameter.
# Higher = better index quality but slower index creation.
# 64 is the pgvector default; 128 is recommended for high-recall production use.
HNSW_EF_CONSTRUCTION = 64

# =============================================================================
# Reciprocal Rank Fusion (RRF) Parameters
# =============================================================================
# Used when combining vector similarity and full-text search results.
# See: https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf

# The RRF smoothing constant (k). Standard value is 60.
# Higher k gives more weight to lower-ranked results.
RRF_K = 60

# Default oversampling factor for hybrid search.
# Each sub-search fetches this multiple of the requested top_k, then RRF
# fuses and re-ranks down to top_k.
HYBRID_SEARCH_OVERSAMPLE_FACTOR = 3

# =============================================================================
# Full-Text Search Configuration
# =============================================================================
# PostgreSQL text search configuration name for tsvector generation.
# "english" provides stemming and stop-word removal for English text.
FTS_CONFIG = "english"
