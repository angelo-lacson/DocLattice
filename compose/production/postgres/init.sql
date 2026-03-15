CREATE EXTENSION IF NOT EXISTS vector;

-- NOTE: hnsw.iterative_scan and hnsw.ef_search are now set via postgres
-- command-line args (-c flags) in the docker-compose files. This avoids
-- database-level ALTER DATABASE SET which causes "invalid configuration
-- parameter name" warnings when the GUC isn't registered during
-- docker-entrypoint-initdb.d execution (the temporary postgres used for
-- initialization doesn't receive user command-line args).
-- Values: hnsw.iterative_scan=relaxed_order, hnsw.ef_search=64
