CREATE EXTENSION IF NOT EXISTS vector;

-- pgvector search optimization (requires pgvector 0.8+)
-- Iterative scans prevent result loss when combining vector search with WHERE clauses.
-- relaxed_order gives the best performance for filtered ANN queries.
DO $$
BEGIN
  EXECUTE 'ALTER DATABASE ' || current_database() || ' SET hnsw.iterative_scan = ''relaxed_order''';
  EXECUTE 'ALTER DATABASE ' || current_database() || ' SET hnsw.ef_search = 64';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector 0.8+ settings not available, skipping: %', SQLERRM;
END $$;
