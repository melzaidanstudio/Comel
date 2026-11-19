import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { body, HttpError, idOf, notFound, route } from '@/lib/api';
import { db } from '@/lib/db';
import { triggers } from '@/lib/db/schema';
import { earlyRules, isEarlyTrigger, RECOMMENDED_METRIC_LOOKUP, viralRules } from '@/lib/recommend';
import { triggerSchema } from '@/lib/validators';
import { getSettings, saveSettings } from '@/lib/settings';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  keyword: z.string().trim().min(2, 'isi kata utama, mis. bogor').max(50)
    .refine((v) => /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(v), 'kata utama hanya boleh huruf/angka/spasi, mis. bogor'),
  applyViral: z.boolean(),
  createEarly: z.boolean(),
  earlyQueries: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
});

/**
 * Terapkan aturan rekomendasi: ubah filter & jadwal trigger ini, dan/atau buat trigger
 * "Komentator awal" (dry-run). Nama, akun, instruksi AI, provider & dry-run trigger ini tidak diubah.
 */
export const POST = route(async (req, ctx: Ctx) => {
  const id = await idOf(ctx);
  const v = schema.parse(await body(req));
  if (!v.applyViral && !v.createEarly) throw new HttpError(400, 'Pilih minimal satu rekomendasi');
  const [t] = await db.select().from(triggers).where(eq(triggers.id, id));
  if (!t) throw notFound('Trigger');
  const kw = v.keyword.toLowerCase();
  const early = isEarlyTrigger(t);
  // pada trigger "Komentator awal" sendiri: hanya perbarui aturannya sebagai komentator awal
  const viral = v.applyViral ? triggerSchema.partial().parse(early ? earlyRules(t, kw, t.queries.length ? t.queries : [kw]) : viralRules(t, kw)) : null;
  const earlyNew = v.createEarly && !early
    ? triggerSchema.partial().parse(earlyRules(t, kw, v.earlyQueries.length ? v.earlyQueries : [kw]))
    : null;
  const done: string[] = [];
  let created: number | null = null;

  await db.transaction(async (tx) => {
    if (viral) {
      await tx.update(triggers).set(viral).where(eq(triggers.id, id));
      done.push(`aturan "${t.name}" diperbarui`);
    }
    if (earlyNew) {
      // sudah ada "Komentator awal …" untuk akun ini → perbarui, jangan buat salinan baru
      const [dup] = await tx.select({ id: triggers.id }).from(triggers)
        .where(and(eq(triggers.accountId, t.accountId), eq(triggers.name, earlyNew.name!))).limit(1);
      if (dup) {
        await tx.update(triggers).set(earlyNew).where(eq(triggers.id, dup.id));
        done.push(`trigger "${earlyNew.name}" yang sudah ada diperbarui`);
      } else {
        const [n] = await tx.insert(triggers).values({
          ...(earlyNew as ReturnType<typeof earlyRules>),
          accountId: t.accountId, enabled: t.enabled, providerId: t.providerId, instruction: t.instruction,
          activeHours: t.activeHours, excludeWords: t.excludeWords, excludeUsers: t.excludeUsers, includeReplies: false,
          nextRunAt: null,
        }).returning({ id: triggers.id, name: triggers.name });
        created = n.id;
        done.push(`trigger "${n.name}" dibuat (dry-run)`);
      }
    }
  });
  if (!done.length) throw new HttpError(400, 'Tidak ada yang diubah');
  const s = await getSettings();
  if ((Number(s.metricLookupMax) || 0) < RECOMMENDED_METRIC_LOOKUP) {
    await saveSettings({ metricLookupMax: RECOMMENDED_METRIC_LOOKUP });
    done.push(`cek metrik dinaikkan ke ${RECOMMENDED_METRIC_LOOKUP} postingan`);
  }
  return { ok: true, created, message: done.join('; ') };
});
