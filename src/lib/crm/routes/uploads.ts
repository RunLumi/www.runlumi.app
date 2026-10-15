import type { APIContext } from 'astro';
import { envFromLocals } from '../../ats';
import { sameOrigin } from '../../http';
import { workspaceUser } from '../../workspace/roles';
import { ConflictError, NotFoundError, ValidationError } from '../core';
import { completeUpload, presignUpload, reserveUpload, uploadConfig, type UploadInput } from '../direct-uploads';

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control':'private, no-store' } });
export async function uploadsRoute(ctx: APIContext): Promise<Response> {
  if (ctx.request.method !== 'POST') return json({ error:'method' },405);
  if (!sameOrigin(ctx.request) || ctx.request.headers.get('origin') !== ctx.url.origin) return json({ error:'origin' },403);
  if (!ctx.request.headers.get('content-type')?.startsWith('application/json')) return json({ error:'json_required' },415);
  const env = envFromLocals(ctx.locals);
  const user = ctx.locals.workspace ?? await workspaceUser(ctx.locals,env.DB);
  if (!user?.can('crm.access')) return json({ error:'access' },403);
  // Metadata only. Reject file bodies before parsing; never log signed URLs.
  if (Number(ctx.request.headers.get('content-length')) > 4096) return json({ error:'body' },413);
  let body: { action?: string; uploadId?: string } & UploadInput;
  try {
    let size = 0;
    const stream = ctx.request.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({ transform(chunk,controller) {
      size += chunk.byteLength; if (size > 4096) throw new RangeError(); controller.enqueue(chunk);
    } }));
    if (!stream) return json({error:'body'},400);
    body = await new Response(stream).json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error:'body'},400);
  } catch { return json({ error:'body' },400); }
  try {
    if (body.action === 'sign') {
      const config = uploadConfig(env,ctx.url.origin);
      if (!config) return json({ error:'not_configured' },503);
      const ticket = await reserveUpload(env.DB,user,body);
      return json({ uploadId:ticket.id, expiresAt:ticket.expires_at, ...await presignUpload(config,ticket) });
    }
    if (body.action === 'complete' && typeof body.uploadId === 'string' && body.uploadId.length <= 100) {
      return json({ fileId:await completeUpload(env.DB,env.FILES,user,body.uploadId) });
    }
    return json({error:'action'},400);
  } catch (error) {
    if (error instanceof NotFoundError) return json({error:'not_found'},404);
    if (error instanceof ConflictError) return json({error:'conflict'},409);
    if (error instanceof ValidationError) {
      const code = Object.values(error.fields)[0] ?? 'invalid';
      return json({error:code},code === 'rate_limit' ? 429 : 422);
    }
    return json({error:'unconfirmed'},500);
  }
}
