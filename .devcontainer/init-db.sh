#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE memories_test;
    GRANT ALL PRIVILEGES ON DATABASE memories_test TO memories;
EOSQL
