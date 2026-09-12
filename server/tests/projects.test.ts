import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Role } from "@prisma/client";
import { app } from "../src/index";
import {
  createUser,
  createClient,
  createProject,
  bearer,
  forgeToken,
  tamperRole,
} from "./helpers";

// ─────────────────────────────────────────────
// Projects Integration Tests
// ─────────────────────────────────────────────

describe("POST /projects", () => {
  it("ADMIN can create a project", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const client = await createClient();

    const res = await request(app)
      .post("/projects")
      .set(bearer(accessToken))
      .send({ name: "Test Project", clientId: client.id });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Test Project");
    expect(res.body.data.clientId).toBe(client.id);
  });

  it("PM can create a project", async () => {
    const { accessToken, user } = await createUser({ role: Role.PM });
    const client = await createClient();

    const res = await request(app)
      .post("/projects")
      .set(bearer(accessToken))
      .send({ name: "PM Project", clientId: client.id });

    expect(res.status).toBe(201);
    expect(res.body.data.createdById).toBe(user.id);
  });

  it("DEVELOPER cannot create a project → 403", async () => {
    const { accessToken } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();

    const res = await request(app)
      .post("/projects")
      .set(bearer(accessToken))
      .send({ name: "Dev Project", clientId: client.id });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects missing clientId → 400 with validation error", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });

    const res = await request(app)
      .post("/projects")
      .set(bearer(accessToken))
      .send({ name: "No Client" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toHaveProperty("clientId");
  });

  it("rejects non-existent clientId → 404", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });

    // clfake0000000000000000000 is a valid CUID format but doesn't exist in DB
    const res = await request(app)
      .post("/projects")
      .set(bearer(accessToken))
      .send({ name: "Bad Client", clientId: "clfake0000000000000000000" });

    expect(res.status).toBe(404);
  });

  it("rejects unauthenticated request → 401", async () => {
    const res = await request(app)
      .post("/projects")
      .send({ name: "Anon Project", clientId: "clid" });

    expect(res.status).toBe(401);
  });

  // ── ADVERSARIAL ────────────────────────────

  it("ADVERSARIAL: forged JWT (wrong secret) → 401", async () => {
    const { user } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const fakeToken = forgeToken({ sub: user.id, email: user.email, role: "ADMIN" });

    const res = await request(app)
      .post("/projects")
      .set(bearer(fakeToken))
      .send({ name: "Hacked", clientId: client.id });

    expect(res.status).toBe(401);
  });

  it("ADVERSARIAL: tampered role in JWT → 401", async () => {
    const { accessToken, user } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const tamperedToken = tamperRole(accessToken, Role.ADMIN);

    const res = await request(app)
      .post("/projects")
      .set(bearer(tamperedToken))
      .send({ name: "Hacked Role", clientId: client.id });

    // Server verifies signature — tampered token has wrong signature → 401
    expect(res.status).toBe(401);
  });
});

describe("GET /projects", () => {
  it("ADMIN sees all projects", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm1 } = await createUser({ role: Role.PM });
    const { user: pm2 } = await createUser({ role: Role.PM });
    const client = await createClient();

    await createProject({ createdById: pm1.id, clientId: client.id });
    await createProject({ createdById: pm2.id, clientId: client.id });

    const res = await request(app)
      .get("/projects")
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("PM sees only their own projects", async () => {
    const { accessToken, user: myPm } = await createUser({ role: Role.PM });
    const { user: otherPm } = await createUser({ role: Role.PM });
    const client = await createClient();

    await createProject({ createdById: myPm.id, clientId: client.id });
    await createProject({ createdById: otherPm.id, clientId: client.id });

    const res = await request(app)
      .get("/projects")
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].createdById).toBe(myPm.id);
  });

  it("DEVELOPER cannot list projects → 403", async () => {
    const { accessToken } = await createUser({ role: Role.DEVELOPER });

    const res = await request(app)
      .get("/projects")
      .set(bearer(accessToken));

    expect(res.status).toBe(403);
  });
});

describe("GET /projects/:id", () => {
  it("PM can read their own project", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .get(`/projects/${project.id}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(project.id);
  });

  it("PM gets 404 (not 403) on another PM's project — no data leakage", async () => {
    const { accessToken } = await createUser({ role: Role.PM });
    const { user: otherPm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({
      createdById: otherPm.id,
      clientId: client.id,
    });

    // Should NOT get 403 (which would confirm the project exists)
    const res = await request(app)
      .get(`/projects/${project.id}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("ADVERSARIAL: Developer crafts request with a PM's project ID → 403", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .get(`/projects/${project.id}`)
      .set(bearer(accessToken));

    // Developer role is rejected at the role gate before reaching the ownership check
    expect(res.status).toBe(403);
  });
});

describe("PATCH /projects/:id", () => {
  it("PM can update their own project", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .patch(`/projects/${project.id}`)
      .set(bearer(accessToken))
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated Name");
  });

  it("PM cannot update another PM's project → 404", async () => {
    const { accessToken } = await createUser({ role: Role.PM });
    const { user: otherPm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({
      createdById: otherPm.id,
      clientId: client.id,
    });

    const res = await request(app)
      .patch(`/projects/${project.id}`)
      .set(bearer(accessToken))
      .send({ name: "Stolen Update" });

    expect(res.status).toBe(404);
  });

  it("ADMIN can update any project", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .patch(`/projects/${project.id}`)
      .set(bearer(accessToken))
      .send({ name: "Admin Override" });

    expect(res.status).toBe(200);
  });

  it("rejects empty body → 400", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .patch(`/projects/${project.id}`)
      .set(bearer(accessToken))
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("DELETE /projects/:id", () => {
  it("PM can delete their own project", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .delete(`/projects/${project.id}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(204);
  });

  it("PM cannot delete another PM's project → 404", async () => {
    const { accessToken } = await createUser({ role: Role.PM });
    const { user: otherPm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({
      createdById: otherPm.id,
      clientId: client.id,
    });

    const res = await request(app)
      .delete(`/projects/${project.id}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(404);
  });

  it("DEVELOPER cannot delete any project → 403", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .delete(`/projects/${project.id}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(403);
  });
});
