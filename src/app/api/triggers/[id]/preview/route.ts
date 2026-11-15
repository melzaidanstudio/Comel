import { idOf, route } from '@/lib/api';
import { collectCandidates } from '@/lib/engine';
import { loadTriggerWithAccount } from '@/lib/trigger-helpers';

/** Scrape & saring tanpa membuat/mengirim apa pun. */
export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { t, a } = await loadTriggerWithAccount(await idOf(ctx));
  return collectCandidates(t, a);
});
