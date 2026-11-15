import { body, route } from '@/lib/api';
import { readPersona, writePersona } from '@/lib/persona';
import { personaSchema } from '@/lib/validators';

export const GET = route(() => readPersona(null));
export const PUT = route(async (req) => { await writePersona(personaSchema.parse(await body(req)), null); });
