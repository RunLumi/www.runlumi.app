import type { AstroGlobal } from 'astro';
import { envFromLocals } from '../../ats';
import { publicChildren, publicFile, downloadFile, type FileItem } from '../files';
import type { Lang } from '../i18n';
import { page, notFound } from '../page';

export interface SharedFilesProps { lang: Lang; item: FileItem; rows: FileItem[]; more: boolean; page: number; token: string }
export async function sharedFilesRoute(astro: AstroGlobal, lang: Lang): Promise<SharedFilesProps | Response> {
  astro.response.headers.set('Cache-Control', 'private, no-store');
  astro.response.headers.set('Referrer-Policy', 'no-referrer');
  astro.response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  astro.response.headers.set('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(astro.request.method)) return new Response('Method not allowed', { status: 405 });
  const { DB, FILES } = envFromLocals(astro.locals);
  const token = astro.params.token ?? '';
  if (!/^[a-f0-9-]{36}$/.test(token)) return notFound(lang);
  const root = await publicFile(DB, token);
  if (!root) return notFound(lang);
  const item = await publicFile(DB, token, astro.url.searchParams.get('item') || undefined);
  if (!item) return notFound(lang);
  if (astro.url.searchParams.has('download')) return downloadFile(FILES, item);
  const list = item.kind === 'folder' ? await publicChildren(DB, item, root.id, page(astro.url)) : { rows: [], more: false };
  return { lang, item, ...list, page: page(astro.url), token };
}
