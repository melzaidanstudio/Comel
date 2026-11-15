import { route } from '@/lib/api';
import { listTags } from '@/lib/tags';

export const GET = route(async (req) => {
  const u = new URL(req.url);
  return listTags(u.searchParams.get('q') || '', Math.min(200, Number(u.searchParams.get('limit')) || 60));
});
