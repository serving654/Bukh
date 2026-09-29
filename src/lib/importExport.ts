import type { Bookmark, BookmarkTag, Collection, CollectionBookmark, Tag } from './types';

export type ExportPayload = {
  version: 1;
  exported_at: string;
  bookmarks: Bookmark[];
  collections: Collection[];
  tags: Tag[];
  bookmark_tags: BookmarkTag[];
  collection_bookmarks: CollectionBookmark[];
};

const download = (name: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportJson = (payload: ExportPayload) =>
  download(`nexus-export-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), 'application/json');

export const exportHtml = (bookmarks: Bookmark[]) => {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const body = bookmarks.map((b) => `<DT><A HREF="${esc(b.url)}" ADD_DATE="${Math.floor(new Date(b.created_at).getTime()/1000)}">${esc(b.title || b.url)}</A>`).join('\n');
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8"><TITLE>NEXUS Bookmarks</TITLE><H1>NEXUS Bookmarks</H1><DL><p>${body}</DL><p>`;
  download(`nexus-bookmarks-${new Date().toISOString().slice(0,10)}.html`, html, 'text/html');
};

export const parseImportFile = async (file: File) => {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json') || file.type.includes('json')) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.bookmarks)) throw new Error('Invalid NEXUS JSON export.');
    return parsed as Partial<ExportPayload>;
  }
  const doc = new DOMParser().parseFromString(text, 'text/html');
  if (!doc) throw new Error('Invalid bookmark HTML.');
  const bookmarks = Array.from(doc.querySelectorAll('a[href]')).map((a) => ({
    url: (a.getAttribute('href') || '').trim(),
    title: (a.textContent || '').trim() || null,
    description: null,
    notes: null,
    favicon_url: null,
    domain: (() => { try { return new URL(a.getAttribute('href') || '').hostname; } catch { return null; } })(),
    image_url: null,
    is_favorite: false,
  }));
  return { bookmarks } as Partial<ExportPayload>;
};
