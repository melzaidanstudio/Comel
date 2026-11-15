import { idOf, route } from '@/lib/api';
import { runTrigger } from '@/lib/engine';

export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => runTrigger(await idOf(ctx), { manual: true }));
