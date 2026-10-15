import type { AstroGlobal } from 'astro';
import { envFromLocals } from '../../ats';
import { sameOrigin } from '../../http';
import { ConflictError, NotFoundError, ValidationError, formValues } from '../core';
import { changeFile, createFolder, downloadFile, fileChildren, filePeople, readFile, fileVersions, deleteFileVersion, type FileItem, type FileVersion } from '../files';
import type { Lang } from '../i18n';
import { context, emptyState, notFound, page, type Ctx, type FormState } from '../page';

export interface FilesProps {
  ctx: Ctx; state: FormState; folder: FileItem | null; selected: FileItem | null; rows: FileItem[];
  versions: FileVersion[]; versionsMore: boolean; versionPage: number; more: boolean; page: number; query: string; people: { id: string; name: string }[];
}

export async function boundedFileForm(request: Request): Promise<FormData> {
  const limit = 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new RangeError('Upload too large');
  if (!request.body) throw new TypeError('Missing body');
  let size = 0;
  const stream = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > limit) throw new RangeError('Upload too large');
      controller.enqueue(chunk);
    },
  }));
  return new Response(stream, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}

export async function filesRoute(astro: AstroGlobal, lang: Lang): Promise<FilesProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const user = astro.locals.workspace!;
  const { FILES } = envFromLocals(astro.locals);
  let state: FormState = { ...emptyState };
  if (astro.request.method === 'POST') {
    // Strict Origin on upload/sharing actions; no cross-site cookie writes.
    if (!sameOrigin(astro.request) || astro.request.headers.get('origin') !== astro.url.origin) return new Response('Invalid request origin', { status: 400 });
    let form: FormData;
    try { form = await boundedFileForm(astro.request); }
    catch (error) { return new Response(lang === 'vi' ? 'Tệp quá lớn hoặc dữ liệu không hợp lệ.' : 'Upload too large or invalid form body.', { status: error instanceof RangeError ? 413 : 400 }); }
    const intent = String(form.get('intent') ?? '');
    state = { ...emptyState, intent, values: formValues(form) };
    try {
      if (intent === 'create' && form.get('kind') === 'file') throw new ValidationError({ upload: 'direct_upload' });
      else if (intent === 'create') await createFolder(ctx.db, user, form);
      else if (intent === 'upload_version') throw new ValidationError({ upload: 'direct_upload' });
      else if (intent === 'delete_version') await deleteFileVersion(ctx.db, FILES, user, form);
      else await changeFile(ctx.db, FILES, ctx.contentDb, user, form);
      const next = new URL(astro.url);
      if (!['upload_version', 'delete_version'].includes(intent)) next.searchParams.delete('item');
      else {
        const id = String(form.get('id') ?? '');
        try { await readFile(ctx.db, user, id); next.searchParams.set('item', id); }
        catch (error) { if (error instanceof NotFoundError) next.searchParams.delete('item'); else throw error; }
        next.searchParams.delete('versions_page');
        next.hash = 'file-details';
      }
      next.searchParams.set('saved', intent);
      return new Response(null, { status: 303, headers: { Location: next.pathname + next.search + next.hash } });
    } catch (error) {
      if (error instanceof NotFoundError) return notFound(lang);
      if (error instanceof ValidationError) { state.errors = error.fields; astro.response.status = 422; }
      else if (error instanceof ConflictError) { state.conflict = true; astro.response.status = 409; }
      else { state.serverError = true; astro.response.status = 500; }
    }
  } else if (astro.request.method !== 'GET' && astro.request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  try {
    const folderId = astro.url.searchParams.get('folder');
    const folder = folderId ? await readFile(ctx.db, user, folderId) : null;
    if (folder && folder.kind !== 'folder') return notFound(lang);
    const selectedId = astro.url.searchParams.get('item');
    const selected = selectedId ? await readFile(ctx.db, user, selectedId) : null;
    if (selected && astro.url.searchParams.has('download')) return downloadFile(FILES, selected, ctx.db, astro.url.searchParams.get('revision'));
    const versionUrl = new URL(astro.url); versionUrl.searchParams.set('page', astro.url.searchParams.get('versions_page') ?? '1');
    const versionPage = page(versionUrl);
    const versions = selected ? await fileVersions(ctx.db, selected, versionPage) : { rows: [], more: false };
    const query = (astro.url.searchParams.get('q') ?? '').slice(0, 180);
    const list = await fileChildren(ctx.db, user, folder?.id ?? null, page(astro.url), query);
    return { ctx, state, folder, selected, versions: versions.rows, versionsMore: versions.more, versionPage, ...list, page: page(astro.url), query, people: selected?.owner_id === user.id ? await filePeople(ctx.db, ctx.contentDb) : [] };
  } catch (error) {
    if (error instanceof NotFoundError) return notFound(lang);
    throw error;
  }
}
