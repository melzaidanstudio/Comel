import { idOf, route } from '@/lib/api';
import { runReplyJob } from '@/lib/engine';

export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => runReplyJob(await idOf(ctx), { manual: true }));
