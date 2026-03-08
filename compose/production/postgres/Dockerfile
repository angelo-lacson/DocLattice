FROM pgvector/pgvector:pg15

# init.sql enables the pgvector extension and configures HNSW iterative scan
# settings on fresh databases. Existing databases get these via migration 0063.
COPY ./compose/production/postgres/init.sql /docker-entrypoint-initdb.d/init.sql

COPY ./compose/production/postgres/maintenance /usr/local/bin/maintenance
RUN chmod +x /usr/local/bin/maintenance/*
RUN mv /usr/local/bin/maintenance/* /usr/local/bin \
    && rmdir /usr/local/bin/maintenance
