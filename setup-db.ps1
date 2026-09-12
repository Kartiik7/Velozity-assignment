# ─────────────────────────────────────────────
# setup-db.ps1
# Run this after setting the correct POSTGRES_SUPERUSER_PASSWORD below,
# OR after running server/prisma/setup.sql manually in pgAdmin.
# ─────────────────────────────────────────────

param(
    [string]$SuperuserPassword = "postgres",
    [string]$PsqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
)

$env:PGPASSWORD = $SuperuserPassword

Write-Host "Creating database user and database..." -ForegroundColor Cyan

& $PsqlPath -U postgres -h localhost -p 5432 -c "CREATE USER cpd_user WITH PASSWORD 'cpd_secret';" 2>&1
& $PsqlPath -U postgres -h localhost -p 5432 -c "CREATE DATABASE cpd_db OWNER cpd_user;" 2>&1
& $PsqlPath -U postgres -h localhost -p 5432 -c "GRANT ALL PRIVILEGES ON DATABASE cpd_db TO cpd_user;" 2>&1
& $PsqlPath -U postgres -h localhost -p 5432 -d cpd_db -c "GRANT ALL ON SCHEMA public TO cpd_user;" 2>&1

Write-Host "Running Prisma migrations..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\server"
npx prisma migrate dev --name init --skip-seed

Write-Host "✅ Database ready! Now run: cd server && npm run dev" -ForegroundColor Green
