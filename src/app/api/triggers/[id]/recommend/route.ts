import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { body, HttpError, idOf, notFound, route } from '@/lib/api';
import { db } from '@/lib/db';
import { triggers } from '@/lib/db/schema';
import { earlyRules, RECOMMENDED_METRIC_LOOKUP, viralRules } from '@/lib/recommend';
import { getSettings, saveSettings } from '@/lib/settings';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  keyword: z.string().trim().min(2, 'isi kata utama, mis. bogor').max(50)
    .refine((v) => !/["()]/.test(v), 'kata utama tidak boleh berisi tanda kutip/kurung'),
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
  const done: string[] = [];

  if (v.applyViral) {
    await db.update(triggers).set(viralRules(t, kw)).where(eq(triggers.id, id));
    done.push(`aturan "${t.name}" diperbarui`);
  }
  let created: number | null = null;
  if (v.createEarly) {
    const queries = v.earlyQueries.length ? v.earlyQueries : [kw];
    const [n] = await db.insert(triggers).values({
      ...earlyRules(t, kw, queries),
      accountId: t.accountId, enabled: t.enabled, providerId: t.providerId, instruction: t.instruction,
      activeHours: t.activeHours, excludeWords: t.excludeWords, excludeUsers: t.excludeUsers, includeReplies: false,
      languages: t.languages,
      nextRunAt: null,
    }).returning({ id: triggers.id, name: triggers.name });
    created = n.id;
    done.push(`trigger "${n.name}" dibuat (dry-run)`);
  }
  const s = await getSettings();
  if ((Number(s.metricLookupMax) || 0) < RECOMMENDED_METRIC_LOOKUP) {
    await saveSettings({ metricLookupMax: RECOMMENDED_METRIC_LOOKUP });
    done.push(`cek metrik dinaikkan ke ${RECOMMENDED_METRIC_LOOKUP} postingan`);
  }
  return { ok: true, created, message: done.join('; ') };
});
