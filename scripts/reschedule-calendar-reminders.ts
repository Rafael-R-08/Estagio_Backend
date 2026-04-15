import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Queue } from 'bullmq';

const calendarQueue = new Queue('calendar-reminders', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

function computeReminderFireAt(
  eventDate: Date,
  reminderMinutesBefore: number,
): Date {
  return new Date(eventDate.getTime() - reminderMinutesBefore * 60 * 1000);
}

async function run() {
  console.log('🚀 Iniciando re-agendamento de lembretes...');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const futureEvents = await prisma.calendarEvent.findMany({
      where: {
        eventDate: { gte: new Date() },
      },
    });

    console.log(`📅 Encontrados ${futureEvents.length} eventos futuros.`);

    for (const event of futureEvents) {
      const { id: eventId, eventDate, reminderMinutesBefore } = event;
      const now = Date.now();

      const reminderConfigs: { type: 'dayBefore' | 'dayOf' | 'final'; time: Date }[] = [
        { type: 'dayBefore', time: new Date(new Date(eventDate).setDate(eventDate.getDate() - 1)) },
        { type: 'dayOf', time: new Date(new Date(eventDate).setHours(9, 0, 0, 0)) },
        { type: 'final', time: computeReminderFireAt(eventDate, reminderMinutesBefore) }
      ];

      for (const config of reminderConfigs) {
        const delay = config.time.getTime() - now;
        
        if (delay > 0) {
          await calendarQueue.add(
            'reminder',
            { eventId, type: config.type },
            { 
              delay, 
              jobId: `reminder:${eventId}:${config.type}`,
              removeOnComplete: true,
            }
          );
          console.log(`✅ Agendado: ${config.type} para evento ${eventId} (delay: ${Math.round(delay/1000/60)} min)`);
        } else {
          console.log(`⏩ Ignorado: ${config.type} para evento ${eventId} (já passou)`);
        }
      }
    }

    console.log('✨ Re-agendamento concluído!');
  } catch (err) {
    console.error('❌ Erro durante o re-agendamento:', err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
    await calendarQueue.close();
    process.exit(0);
  }
}

run();
