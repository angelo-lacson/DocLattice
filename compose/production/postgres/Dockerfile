FROM pgvector/pgvector:pg15

RUN apt-get update && apt-get install -y git build-essential postgresql-server-dev-15
RUN cd /tmp && git clone --branch v0.8.2 https://github.com/pgvector/pgvector.git && cd pgvector && make && make install

# init.sql enables the pgvector extension and configures HNSW iterative scan
# settings on fresh databases. Existing databases get these via migration 0063.
COPY ./compose/production/postgres/init.sql /docker-entrypoint-initdb.d/init.sql

COPY ./compose/production/postgres/maintenance /usr/local/bin/maintenance
RUN chmod +x /usr/local/bin/maintenance/*
RUN mv /usr/local/bin/maintenance/* /usr/local/bin \
    && rmdir /usr/local/bin/maintenance
