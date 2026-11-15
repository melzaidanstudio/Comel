import { body, idOf, route } from '@/lib/api';
import { readPersona, writePersona } from '@/lib/persona';
import { personaSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, ctx: Ctx) => readPersona(await idOf(ctx)));
export const PUT = route(async (req, ctx: Ctx) => { await writePersona(personaSchema.parse(await body(req)), await idOf(ctx)); });
