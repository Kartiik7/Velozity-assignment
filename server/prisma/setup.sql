-- ─────────────────────────────────────────────
-- Run this in pgAdmin Query Tool (connected as postgres superuser)
-- or in psql as the postgres user.
-- ─────────────────────────────────────────────

-- 1. Create the application user
CREATE USER cpd_user WITH PASSWORD 'cpd_secret';

-- 2. Create the database
CREATE DATABASE cpd_db OWNER cpd_user;

-- 3. Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE cpd_db TO cpd_user;

-- 4. (PostgreSQL 15+) Also grant schema privileges
\c cpd_db
GRANT ALL ON SCHEMA public TO cpd_user;
