import { desc, like, sql } from 'drizzle-orm';
import { db } from './db';
import { tags } from './db/schema';
import { normTag } from './filters';
import type { Post } from './types';

export async function recordTags(posts: Post[]) {
  const seen = new Set<string>();
  for (const p of posts) {
    if (!p.tag) continue;
    const norm = normTag(p.tag.name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    await db.insert(tags).values({
      norm, tagId: p.tag.id, name: p.tag.name, displayName: p.tag.display, isCommunity: p.tag.community, seenCount: 1,
    }).onConflictDoUpdate({
      target: tags.norm,
      set: {
        tagId: sql`coalesce(nullif(excluded.tag_id, ''), ${tags.tagId})`,
        name: p.tag.name,
        displayName: p.tag.display,
        seenCount: sql`${tags.seenCount} + 1`,
        lastSeen: new Date(),
      },
    });
  }
}

export async function listTags(q = '', limit = 60) {
  const n = normTag(q);
  const base = db.select().from(tags);
  return (n ? base.where(like(tags.norm, `%${n}%`)) : base)
    .orderBy(desc(tags.seenCount), desc(tags.lastSeen)).limit(limit);
}
