#!/bin/sh
# Auth gets its own database and role, so the app's Prisma migrations never touch its tables.
set -eu
psql -v ON_ERROR_STOP=1 -v pw="$AUTH_DB_PASSWORD" --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE ROLE postgres NOLOGIN;
CREATE ROLE supabase_auth_admin LOGIN PASSWORD :'pw';
CREATE DATABASE auth OWNER supabase_auth_admin;
CREATE DATABASE lifeos_test OWNER lifeos;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname auth <<'SQL'
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth;
SQL
