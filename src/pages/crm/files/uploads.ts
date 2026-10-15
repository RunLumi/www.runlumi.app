import type { APIRoute } from 'astro';
import { uploadsRoute } from '../../../lib/crm/routes/uploads';
export const prerender = false;
export const ALL: APIRoute = uploadsRoute;
