import { describe, it, expect } from "vitest";
import request from "supertest";
import { Role, TaskStatus, TaskPriority } from "@prisma/client";
import { app } from "../src/index";
import { prisma } from "../src/lib/prisma";
import {
  createUser,
  createClient,
  createProject,
  createTask,
  bearer,
  forgeToken,
  tamperRole,
} from "./helpers";

// ─────────────────────────────────────────────
// Tasks Integration Tests
// ─────────────────────────────────────────────

describe("POST /projects/:projectId/tasks", () => {
  it("PM can create a task in their own project", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken))
      .send({ title: "Build login page", priority: TaskPriority.HIGH });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("Build login page");
    expect(res.body.data.priority).toBe("HIGH");
    expect(res.body.data.status).toBe("TODO");
  });

  it("ADMIN can create a task in any project", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken))
      .send({ title: "Admin task" });

    expect(res.status).toBe(201);
  });

  it("PM cannot create a task in another PM's project → 404", async () => {
    const { accessToken } = await createUser({ role: Role.PM });
    const { user: otherPm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({
      createdById: otherPm.id,
      clientId: client.id,
    });

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken))
      .send({ title: "Intrusion attempt" });

    expect(res.status).toBe(404);
  });

  it("DEVELOPER cannot create tasks → 403", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken))
      .send({ title: "Dev tries to create" });

    expect(res.status).toBe(403);
  });

  it("rejects invalid priority enum → 400 VALIDATION_ERROR", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken))
      .send({ title: "Bad priority", priority: "URGENT" }); // not a valid enum

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toHaveProperty("priority");
  });

  it("rejects missing title → 400", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken))
      .send({ priority: "HIGH" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty("title");
  });

  it("rejects assigning a non-developer user → 400", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const { user: anotherPm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken))
      .send({ title: "Assign to PM", assignedDeveloperId: anotherPm.id });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DEVELOPER/);
  });

  // ── ADVERSARIAL ────────────────────────────

  it("ADVERSARIAL: forged token with ADMIN role → 401", async () => {
    const { user: dev } = await createUser({ role: Role.DEVELOPER });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const fakeToken = forgeToken({ sub: dev.id, email: dev.email, role: "ADMIN" });

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(fakeToken))
      .send({ title: "Hacked" });

    expect(res.status).toBe(401);
  });
});

describe("GET /projects/:projectId/tasks (with filters)", () => {
  it("PM sees only tasks in their project", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const { user: otherPm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const myProject = await createProject({ createdById: pm.id, clientId: client.id });
    const otherProject = await createProject({
      createdById: otherPm.id,
      clientId: client.id,
    });

    await createTask({ projectId: myProject.id, title: "My task" });
    await createTask({ projectId: otherProject.id, title: "Other task" });

    const res = await request(app)
      .get(`/projects/${myProject.id}/tasks`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("My task");
  });

  it("DEVELOPER sees only their assigned tasks", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken, user: dev } = await createUser({ role: Role.DEVELOPER });
    const { user: otherDev } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    await createTask({ projectId: project.id, title: "My task", assignedDeveloperId: dev.id });
    await createTask({ projectId: project.id, title: "Other dev task", assignedDeveloperId: otherDev.id });
    await createTask({ projectId: project.id, title: "Unassigned" });

    const res = await request(app)
      .get(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("My task");
  });

  it("ADMIN sees all tasks", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm } = await createUser({ role: Role.PM });
    const { user: dev } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    await createTask({ projectId: project.id, assignedDeveloperId: dev.id });
    await createTask({ projectId: project.id });

    const res = await request(app)
      .get(`/projects/${project.id}/tasks`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("filters by status=IN_PROGRESS", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    await prisma.task.createMany({
      data: [
        { title: "Todo task", projectId: project.id, status: TaskStatus.TODO },
        { title: "In progress task", projectId: project.id, status: TaskStatus.IN_PROGRESS },
        { title: "Done task", projectId: project.id, status: TaskStatus.DONE },
      ],
    });

    const res = await request(app)
      .get(`/projects/${project.id}/tasks?status=IN_PROGRESS`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("IN_PROGRESS");
  });

  it("filters by priority=CRITICAL", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    await prisma.task.createMany({
      data: [
        { title: "Low", projectId: project.id, priority: TaskPriority.LOW },
        { title: "Critical", projectId: project.id, priority: TaskPriority.CRITICAL },
      ],
    });

    const res = await request(app)
      .get(`/projects/${project.id}/tasks?priority=CRITICAL`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Critical");
  });

  it("filters by dueDateFrom and dueDateTo", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    await prisma.task.createMany({
      data: [
        {
          title: "Past task",
          projectId: project.id,
          dueDate: new Date("2025-01-01"),
        },
        {
          title: "Future task",
          projectId: project.id,
          dueDate: new Date("2027-12-31"),
        },
        {
          title: "In window task",
          projectId: project.id,
          dueDate: new Date("2026-06-15"),
        },
      ],
    });

    const res = await request(app)
      .get(
        `/projects/${project.id}/tasks?dueDateFrom=2026-01-01T00:00:00Z&dueDateTo=2026-12-31T23:59:59Z`
      )
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("In window task");
  });

  it("rejects invalid status filter → 400", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    const res = await request(app)
      .get(`/projects/${project.id}/tasks?status=INVALID_STATUS`)
      .set(bearer(accessToken));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns paginated results", async () => {
    const { accessToken } = await createUser({ role: Role.ADMIN });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });

    // Create 5 tasks
    for (let i = 0; i < 5; i++) {
      await createTask({ projectId: project.id, title: `Task ${i}` });
    }

    const res = await request(app)
      .get(`/projects/${project.id}/tasks?page=1&limit=3`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.pages).toBe(2);
  });
});

describe("PATCH /projects/:projectId/tasks/:id", () => {
  it("PM can update any task field in their project", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id });

    const res = await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken))
      .send({ title: "Updated Title", priority: "CRITICAL", status: "IN_PROGRESS" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Updated Title");
    expect(res.body.data.priority).toBe("CRITICAL");
    expect(res.body.data.status).toBe("IN_PROGRESS");
  });

  it("status change writes a TaskActivityLog row", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id }); // starts TODO

    await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken))
      .send({ status: "IN_PROGRESS" });

    const log = await prisma.taskActivityLog.findFirst({
      where: { taskId: task.id },
    });

    expect(log).not.toBeNull();
    expect(log!.fromStatus).toBe("TODO");
    expect(log!.toStatus).toBe("IN_PROGRESS");
    expect(log!.userId).toBe(pm.id);
  });

  it("no-change in status does NOT write an activity log row", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id }); // TODO

    await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken))
      .send({ title: "New title" }); // no status change

    const logs = await prisma.taskActivityLog.findMany({ where: { taskId: task.id } });
    expect(logs).toHaveLength(0);
  });

  it("DEVELOPER can update status of their assigned task", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken, user: dev } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({
      projectId: project.id,
      assignedDeveloperId: dev.id,
    });

    const res = await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken))
      .send({ status: "IN_REVIEW" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("IN_REVIEW");
  });

  it("DEVELOPER cannot update non-status fields → 400", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken, user: dev } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({
      projectId: project.id,
      assignedDeveloperId: dev.id,
    });

    const res = await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken))
      .send({ title: "Sneaky rename", status: "IN_PROGRESS" });

    // Schema only allows { status } for developers
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("DEVELOPER cannot update another developer's task → 404", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken } = await createUser({ role: Role.DEVELOPER });
    const { user: otherDev } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({
      projectId: project.id,
      assignedDeveloperId: otherDev.id,
    });

    const res = await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken))
      .send({ status: "DONE" });

    // 404 — don't reveal task exists to non-assignee
    expect(res.status).toBe(404);
  });

  it("PM cannot update tasks in another PM's project → 404", async () => {
    const { accessToken } = await createUser({ role: Role.PM });
    const { user: otherPm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({
      createdById: otherPm.id,
      clientId: client.id,
    });
    const task = await createTask({ projectId: project.id });

    const res = await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken))
      .send({ status: "DONE" });

    expect(res.status).toBe(404);
  });

  it("rejects invalid status enum → 400", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id });

    const res = await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken))
      .send({ status: "COMPLETED" }); // not a valid enum

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty("status");
  });

  // ── ADVERSARIAL ────────────────────────────

  it("ADVERSARIAL: Developer forges ADMIN JWT with wrong secret → 401", async () => {
    const { user: dev } = await createUser({ role: Role.DEVELOPER });
    const { user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id });

    const fakeToken = forgeToken({ sub: dev.id, email: dev.email, role: "ADMIN" });

    const res = await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(fakeToken))
      .send({ title: "Escalated" });

    expect(res.status).toBe(401);
  });

  it("ADVERSARIAL: Developer tampers real JWT to claim PM role → 401", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken: devToken } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id });

    const tamperedToken = tamperRole(devToken, Role.PM);

    const res = await request(app)
      .patch(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(tamperedToken))
      .send({ title: "Privilege escalation" });

    expect(res.status).toBe(401); // signature invalid → rejected before role check
  });
});

describe("DELETE /projects/:projectId/tasks/:id", () => {
  it("PM can delete a task in their project", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id });

    const res = await request(app)
      .delete(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(204);
  });

  it("DEVELOPER cannot delete tasks → 403", async () => {
    const { user: pm } = await createUser({ role: Role.PM });
    const { accessToken, user: dev } = await createUser({ role: Role.DEVELOPER });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id, assignedDeveloperId: dev.id });

    const res = await request(app)
      .delete(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(403);
  });
});

describe("GET /projects/:projectId/tasks/:id", () => {
  it("returns task with activity logs included", async () => {
    const { accessToken, user: pm } = await createUser({ role: Role.PM });
    const client = await createClient();
    const project = await createProject({ createdById: pm.id, clientId: client.id });
    const task = await createTask({ projectId: project.id });

    // Write a log manually
    await prisma.taskActivityLog.create({
      data: {
        taskId: task.id,
        userId: pm.id,
        fromStatus: TaskStatus.TODO,
        toStatus: TaskStatus.IN_PROGRESS,
      },
    });

    const res = await request(app)
      .get(`/projects/${project.id}/tasks/${task.id}`)
      .set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.activityLogs).toHaveLength(1);
    expect(res.body.data.activityLogs[0].fromStatus).toBe("TODO");
    expect(res.body.data.activityLogs[0].toStatus).toBe("IN_PROGRESS");
  });
});

describe("Error response shape", () => {
  it("all error responses follow { error: { code, message } } shape", async () => {
    const { accessToken } = await createUser({ role: Role.DEVELOPER });

    const endpoints = [
      () => request(app).post("/projects").set(bearer(accessToken)).send({}),
      () => request(app).get("/projects").set(bearer(accessToken)),
      () =>
        request(app)
          .post("/projects/nonexistentid/tasks")
          .set(bearer(accessToken))
          .send({ title: "x" }),
    ];

    for (const ep of endpoints) {
      const res = await ep();
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toHaveProperty("code");
      expect(res.body.error).toHaveProperty("message");
      // Must never have a 'stack' property in the response
      expect(res.body.error).not.toHaveProperty("stack");
    }
  });
});
