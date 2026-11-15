import { desc } from 'drizzle-orm';
import { route } from '@/lib/api';
import { db } from '@/lib/db';
import { logs } from '@/lib/db/schema';

export const GET = route(async (req) => {
  const limit = Math.min(1000, Number(new URL(req.url).searchParams.get('limit')) || 200);
  return db.select().from(logs).orderBy(desc(logs.id)).limit(limit);
});
