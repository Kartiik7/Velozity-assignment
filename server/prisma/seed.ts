import { PrismaClient, Role, TaskStatus, TaskPriority } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed script...')

  // Clear existing non-user data to ensure idempotency
  await prisma.notification.deleteMany({})
  await prisma.project.deleteMany({}) // cascades to tasks and activity logs
  await prisma.client.deleteMany({})

  const passwordHash = await bcrypt.hash('password123', 12)

  // 1. Seed Users
  const users = {
    admin: await prisma.user.upsert({ where: { email: 'admin@velozity.com' }, update: {}, create: { email: 'admin@velozity.com', passwordHash, role: Role.ADMIN } }),
    pm1: await prisma.user.upsert({ where: { email: 'pm1@velozity.com' }, update: {}, create: { email: 'pm1@velozity.com', passwordHash, role: Role.PM } }),
    pm2: await prisma.user.upsert({ where: { email: 'pm2@velozity.com' }, update: {}, create: { email: 'pm2@velozity.com', passwordHash, role: Role.PM } }),
    dev1: await prisma.user.upsert({ where: { email: 'dev1@velozity.com' }, update: {}, create: { email: 'dev1@velozity.com', passwordHash, role: Role.DEVELOPER } }),
    dev2: await prisma.user.upsert({ where: { email: 'dev2@velozity.com' }, update: {}, create: { email: 'dev2@velozity.com', passwordHash, role: Role.DEVELOPER } }),
    dev3: await prisma.user.upsert({ where: { email: 'dev3@velozity.com' }, update: {}, create: { email: 'dev3@velozity.com', passwordHash, role: Role.DEVELOPER } }),
    dev4: await prisma.user.upsert({ where: { email: 'dev4@velozity.com' }, update: {}, create: { email: 'dev4@velozity.com', passwordHash, role: Role.DEVELOPER } }),
  }
  const devs = [users.dev1, users.dev2, users.dev3, users.dev4]
  console.log('✅ Users seeded')

  // 2. Seed Client
  const client = await prisma.client.create({ data: { name: 'Acme Corp', contactEmail: 'contact@acmecorp.com' } })
  console.log('✅ Client seeded')

  // 3. Seed Projects & Tasks
  const pmIds = [users.pm1.id, users.pm2.id, users.pm1.id]
  const now = new Date()
  const pastDue = new Date(now.getTime() - 48 * 60 * 60 * 1000) // 2 days ago
  const futureDue = new Date(now.getTime() + 48 * 60 * 60 * 1000) // 2 days from now

  for (let p = 1; p <= 3; p++) {
    const project = await prisma.project.create({
      data: {
        name: `Acme Project ${p}`,
        description: `Project ${p} deliverables for Acme Corp`,
        clientId: client.id,
        createdById: pmIds[p - 1],
      }
    })

    for (let t = 1; t <= 5; t++) {
      const isOverdueTask = p === 1 && (t === 1 || t === 2) // make first two tasks in project 1 overdue
      const dev = devs[(p + t) % devs.length]
      
      const task = await prisma.task.create({
        data: {
          title: `Task ${t} for ${project.name}`,
          description: `Detailed description for task ${t}`,
          projectId: project.id,
          assignedDeveloperId: dev.id,
          status: isOverdueTask ? TaskStatus.TODO : [TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, TaskStatus.DONE][t % 3],
          priority: [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.CRITICAL][t % 4],
          dueDate: isOverdueTask ? pastDue : futureDue,
          isOverdue: false // Let the cron job mark it true, or we can mark it false so the seed proves the cron job works
        }
      })

      // 4. Seed Activity Logs
      await prisma.taskActivityLog.create({
        data: {
          taskId: task.id,
          userId: pmIds[p - 1],
          fromStatus: TaskStatus.TODO,
          toStatus: task.status,
          changedAt: new Date(now.getTime() - 1000 * 60 * 60) // 1 hr ago
        }
      })

      // 5. Seed Notifications
      if (task.status === TaskStatus.IN_REVIEW) {
        await prisma.notification.create({
          data: {
            userId: pmIds[p - 1],
            type: 'STATUS_CHANGED',
            message: `Task moved to IN_REVIEW: ${task.title}`
          }
        })
      }
      if (t === 1) { // 1 notification per project for a dev
        await prisma.notification.create({
          data: {
            userId: dev.id,
            type: 'TASK_ASSIGNED',
            message: `You have been assigned to task: ${task.title}`
          }
        })
      }
    }
  }
  
  console.log('✅ Projects, Tasks, Logs, and Notifications seeded')
  console.log('✅ Seed completed successfully.')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
