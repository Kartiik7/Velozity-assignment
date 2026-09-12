# Group 1: Scaffold
git add .gitignore docker-compose.yml setup-db.ps1
git add client/package.json client/package-lock.json client/tsconfig.json client/tsconfig.app.json client/tsconfig.node.json client/vite.config.ts client/index.html client/public/ client/src/main.tsx client/src/App.css client/src/index.css client/src/assets/ client/.gitignore client/.oxlintrc.json client/Dockerfile
git add server/package.json server/package-lock.json server/tsconfig.json server/vitest.config.ts server/.env.example server/src/config.ts server/Dockerfile
git commit -m "chore: project scaffold"

# Group 2: DB
git add server/prisma/ server/src/lib/prisma.ts
git commit -m "feat: prisma schema and db setup"

# Group 3: Error handling
git add server/src/lib/errors.ts server/src/middleware/errorHandler.ts
git commit -m "feat: centralized error handling"

# Group 4: Auth
git add server/src/lib/jwt.ts server/src/middleware/auth.ts server/src/routes/auth.ts client/src/contexts/AuthContext.tsx
git commit -m "feat: user auth - signup/login and jwt refresh token"

# Group 5: Roles
git add server/src/middleware/requireRole.ts
git commit -m "feat: role middleware"

# Group 6: Projects
git add server/src/routes/projects.ts server/tests/projects.test.ts
git commit -m "feat: project CRUD"

# Group 7: Tasks
git add server/src/routes/tasks.ts server/src/lib/taskFilters.ts server/tests/tasks.test.ts
git commit -m "feat: task CRUD and query filters"

# Group 8: WebSockets
git add server/src/lib/socket.ts
git commit -m "feat: websocket server and role-scoped activity feed"

# Group 9: Backend Dashboards & Notifications
git add server/src/routes/dashboard.ts server/src/routes/notifications.ts
git commit -m "feat: dashboards backend and notifications api"

# Group 10: Cron
git add server/src/jobs/overdue.ts
git commit -m "feat: overdue task cron job"

# Group 11: Frontend UI
git add client/src/App.tsx client/src/components/
git commit -m "feat: frontend dashboards, feed, and notifications ui"

# Group 12: Core Server
git add server/src/index.ts server/src/routes/health.ts server/tests/setup.ts server/tests/helpers.ts
git commit -m "feat: core server integration and test setup"

# Group 13: Docs
git add README.md client/README.md
git commit -m "docs: complete README documentation"

# Any leftover files
git add .
git commit -m "chore: catch remaining miscellaneous files"

git branch -M main
git remote add origin https://github.com/Kartiik7/Velozity-assignment.git
git push -u origin main -f
