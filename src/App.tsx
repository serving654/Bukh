import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  bootstrapDevice,
  bookmarksApi,
  collectionsApi,
  preferencesApi,
  profileApi,
  tagsApi,
} from './lib/api';
import {
  exportHtml,
  exportJson,
  parseImportFile,
  type ExportPayload,
} from './lib/importExport';
import type {
  Bookmark,
  BookmarkTag,
  Collection,
  CollectionBookmark,
  Profile,
  Tag,
  UserPreferences,
} from './lib/types';

import {
  Search,
  Plus,
  Star,
  Clock3,
  Folder,
  Tag as TagIcon,
  Settings,
  LogOut,
  Command,
  ExternalLink,
  Copy,
  Trash2,
  X,
  Menu,
  ChevronRight,
  Upload,
  Download,
  Edit3,
} from 'lucide-react';

type View =
  | 'all'
  | 'starred'
  | 'recent'
  | 'collections'
  | 'tags'
  | 'settings';

const formatRelative = (value: string | null) => {
  if (!value) return '—';

  const days = Math.round(
    (new Date(value).getTime() - Date.now()) / 86400000
  );

  return new Intl.RelativeTimeFormat(undefined, {
    numeric: 'auto',
  }).format(days, 'day');
};

const getDeviceId = () => {
  const key = 'bukh_device_id';

  let id = localStorage.getItem(key);

  if (!id) {
    id = crypto.randomUUID().replaceAll(/-/g, '');
    localStorage.setItem(key, id);
  }

  return id;
};

function BootScreen({ message = 'INITIALIZING' }: { message?: string }) {
  return (
    <div className="boot">
      NEXUS
      <span>{message}</span>
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    const start = async () => {
      try {
        const {
          data: { session: existingSession },
        } = await supabase.auth.getSession();

        if (existingSession) {
          if (alive) {
            setSession(existingSession);
            setLoading(false);
          }
          return;
        }

        const deviceId = getDeviceId();

        await bootstrapDevice(deviceId);

        const {
          data: { session: newSession },
        } = await supabase.auth.getSession();

        if (!newSession) {
          throw new Error('Unable to initialize your Bukh vault.');
        }

        if (alive) {
          setSession(newSession);
          setLoading(false);
        }
      } catch (e: any) {
        console.error(e);

        if (alive) {
          setError(e?.message || 'Unable to initialize Bukh.');
          setLoading(false);
        }
      }
    };

    start();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (alive) setSession(newSession);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <BootScreen />;
  }

  if (error) {
    return (
      <div className="boot">
        NEXUS
        <span>{error}</span>
      </div>
    );
  }

  if (!session) {
    return <BootScreen message="NO SESSION" />;
  }

  return <Vault />;
}

function Vault() {
  const [view, setView] = useState<View>('all');

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [bookmarkTags, setBookmarkTags] = useState<BookmarkTag[]>([]);
  const [collectionLinks, setCollectionLinks] = useState<
    CollectionBookmark[]
  >([]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] =
    useState<UserPreferences | null>(null);

  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [selected, setSelected] = useState<Bookmark | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobile, setMobile] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [
        bookmarkData,
        collectionData,
        tagData,
        profileData,
        bookmarkTagData,
        collectionLinkData,
        preferenceData,
      ] = await Promise.all([
        bookmarksApi.list(),
        collectionsApi.list(),
        tagsApi.list(),
        profileApi.get(),
        tagsApi.links(),
        collectionsApi.links(),
        preferencesApi.get(),
      ]);

      setBookmarks(bookmarkData);
      setCollections(collectionData);
      setTags(tagData);
      setProfile(profileData);
      setBookmarkTags(bookmarkTagData as BookmarkTag[]);
      setCollectionLinks(
        collectionLinkData as CollectionBookmark[]
      );
      setPreferences(preferenceData);
    } catch (e) {
      console.error('Vault load failed:', e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }

      if (event.key === 'Escape') {
        setCommandOpen(false);
        setModal(false);
        setSelected(null);
        setEditing(null);
      }
    };

    window.addEventListener('keydown', handler);

    return () => window.removeEventListener('keydown', handler);
  }, []);

  const collectionNames = useMemo(
    () => new Map(collections.map((c) => [c.id, c.name])),
    [collections]
  );

  const tagNames = useMemo(
    () => new Map(tags.map((t) => [t.id, t.name])),
    [tags]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return bookmarks.filter((bookmark) => {
      if (
        view === 'starred' &&
        !bookmark.is_favorite
      ) {
        return false;
      }

      if (
        view === 'recent' &&
        new Date(bookmark.created_at).getTime() <
          Date.now() - 7 * 86400000
      ) {
        return false;
      }

      const linkedCollection = collectionLinks
        .filter((x) => x.bookmark_id === bookmark.id)
        .map(
          (x) =>
            collectionNames.get(x.collection_id) || ''
        )
        .join(' ');

      const linkedTags = bookmarkTags
        .filter((x) => x.bookmark_id === bookmark.id)
        .map((x) => tagNames.get(x.tag_id) || '')
        .join(' ');

      if (!q) return true;

      return [
        bookmark.title,
        bookmark.url,
        bookmark.domain,
        bookmark.description,
        bookmark.notes,
        linkedCollection,
        linkedTags,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(q)
        );
    });
  }, [
    bookmarks,
    query,
    view,
    bookmarkTags,
    collectionLinks,
    collectionNames,
    tagNames,
  ]);

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const nav = (nextView: View) => {
    setView(nextView);
    setMobile(false);
    setCommandOpen(false);
  };

  const openImport = () => {
    fileRef.current?.click();
  };

  const importFile = async (file: File) => {
    try {
      const data = await parseImportFile(file);

      const importedBookmarks =
        (data.bookmarks || []) as any[];

      for (const bookmark of importedBookmarks) {
        if (!bookmark.url) continue;

        const created = await bookmarksApi.create({
          url: bookmark.url,
          title: bookmark.title || '',
          description:
            bookmark.description || null,
          notes: bookmark.notes || null,
          favicon_url:
            bookmark.favicon_url || null,
          image_url: bookmark.image_url || null,
          is_favorite:
            !!bookmark.is_favorite,
          domain: bookmark.domain || null,
        });

        const collection = (
          data.collections || []
        ).find((c: any) =>
          (data.collection_bookmarks || []).some(
            (link: any) =>
              link.bookmark_id === bookmark.id &&
              link.collection_id === c.id
          )
        );

        if (collection) {
          const existing = collections.find(
            (c) =>
              c.name.toLowerCase() ===
              String(collection.name).toLowerCase()
          );

          const target =
            existing ||
            (await collectionsApi.create({
              name: collection.name,
              description:
                collection.description || null,
              icon: collection.icon || null,
            }));

          await collectionsApi.addBookmark(
            target.id,
            created.id
          );
        }
      }

      await load();
      alert('Import complete.');
    } catch (e: any) {
      alert(
        e?.message ||
          'Unable to import bookmarks.'
      );
    } finally {
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };

  const payload: ExportPayload = {
    version: 1,
    exported_at: new Date().toISOString(),
    bookmarks,
    collections,
    tags,
    bookmark_tags: bookmarkTags,
    collection_bookmarks: collectionLinks,
  };

  return (
    <div className="app">
      <aside
        className={
          mobile
            ? 'sidebar mobile-open'
            : 'sidebar'
        }
      >
        <div className="side-brand">
          <span className="brand-mark">N</span>

          <b>NEXUS</b>

          <button
            className="icon-btn mobile-close"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav>
          {[
            ['all', 'All Bookmarks', Search],
            ['starred', 'Starred', Star],
            ['recent', 'Recent', Clock3],
            ['collections', 'Collections', Folder],
            ['tags', 'Tags', TagIcon],
            ['settings', 'Settings', Settings],
          ].map(([key, label, Icon]: any) => (
            <button
              key={key}
              className={
                view === key
                  ? 'nav-item active'
                  : 'nav-item'
              }
              onClick={() => nav(key)}
            >
              <Icon size={17} />
              <span>{label}</span>

              {key === 'all' && (
                <small>{bookmarks.length}</small>
              )}
            </button>
          ))}
        </nav>

        <div className="side-account">
          <div className="avatar">
            {profile?.user_id
              ?.slice(0, 1)
              .toUpperCase() || 'N'}
          </div>

          <div>
            <b>
              {profile?.user_id ||
                'NEXUS USER'}
            </b>

            <span>Personal vault</span>
          </div>

          <button
            className="icon-btn"
            onClick={logout}
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobile(true)}
          >
            <Menu size={19} />
          </button>

          <div className="search">
            <Search size={17} />

            <input
              aria-label="Search your vault"
              placeholder="Search your vault…"
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
            />

            <kbd>⌘ K</kbd>
          </div>

          <button
            className="command"
            onClick={() =>
              setCommandOpen(true)
            }
          >
            <Command size={16} />
            <span>Command</span>
            <kbd>⌘K</kbd>
          </button>

          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setModal(true);
            }}
          >
            <Plus size={17} />
            <span>Add bookmark</span>
          </button>
        </header>

        <section className="content">
          <div className="heading">
            <div>
              <p className="eyebrow">
                {view === 'all'
                  ? 'VAULT OVERVIEW'
                  : view.toUpperCase()}
              </p>

              <h2>
                {view === 'all'
                  ? 'Recent signals'
                  : view === 'starred'
                    ? 'Starred signals'
                    : view === 'recent'
                      ? 'Recent signals'
                      : view === 'collections'
                        ? 'Collections'
                        : view === 'tags'
                          ? 'Tags'
                          : 'System settings'}
              </h2>
            </div>

            <span className="signal">
              ● SYSTEM ONLINE
            </span>
          </div>

          {view === 'settings' ? (
            <SettingsPanel
              profile={profile}
              preferences={preferences}
              onPreferences={setPreferences}
              onLogout={logout}
              onImport={openImport}
              onExportJson={() =>
                exportJson(payload)
              }
              onExportHtml={() =>
                exportHtml(bookmarks)
              }
            />
          ) : view === 'collections' ? (
            <CollectionPanel
              collections={collections}
              onCreate={async () => {
                const name = prompt(
                  'Collection name'
                );

                if (name?.trim()) {
                  try {
                    await collectionsApi.create({
                      name: name.trim(),
                    });

                    await load();
                  } catch (e: any) {
                    alert(e.message);
                  }
                }
              }}
              onRefresh={load}
            />
          ) : view === 'tags' ? (
            <TagPanel
              tags={tags}
              onRefresh={load}
            />
          ) : (
            <>
              <Stats
                bookmarks={bookmarks}
                collections={collections}
                tags={tags}
              />

              <div className="section-title">
                <span>
                  {query
                    ? `Search results for “${query}”`
                    : 'Recent signals'}
                </span>

                <span className="muted">
                  {filtered.length} items
                </span>
              </div>

              <div className="bookmark-grid">
                {filtered.map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    tags={bookmarkTags
                      .filter(
                        (x) =>
                          x.bookmark_id ===
                          bookmark.id
                      )
                      .map(
                        (x) =>
                          tagNames.get(
                            x.tag_id
                          )
                      )
                      .filter(Boolean) as string[]}
                    collection={
                      collectionLinks.find(
                        (x) =>
                          x.bookmark_id ===
                          bookmark.id
                      )
                        ? collectionNames.get(
                            collectionLinks.find(
                              (x) =>
                                x.bookmark_id ===
                                bookmark.id
                            )!.collection_id
                          )
                        : undefined
                    }
                    onOpen={async () => {
                      await bookmarksApi.open(
                        bookmark.id
                      );

                      window.open(
                        bookmark.url,
                        '_blank',
                        'noopener,noreferrer'
                      );
                    }}
                    onFavorite={async () => {
                      const updated =
                        await bookmarksApi.update(
                          bookmark.id,
                          {
                            is_favorite:
                              !bookmark.is_favorite,
                          }
                        );

                      setBookmarks((items) =>
                        items.map((item) =>
                          item.id === updated.id
                            ? updated
                            : item
                        )
                      );
                    }}
                    onDelete={async () => {
                      if (
                        confirm(
                          'Delete this bookmark?'
                        )
                      ) {
                        await bookmarksApi.remove(
                          bookmark.id
                        );

                        setBookmarks((items) =>
                          items.filter(
                            (item) =>
                              item.id !==
                              bookmark.id
                          )
                        );
                      }
                    }}
                    onEdit={() => {
                      setEditing(bookmark);
                      setModal(true);
                    }}
                    onSelect={() =>
                      setSelected(bookmark)
                    }
                  />
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="empty">
                  <div className="empty-icon">
                    ⌁
                  </div>

                  <h3>
                    {query
                      ? 'No matching signals found.'
                      : 'Your vault is empty.'}
                  </h3>

                  <p>
                    {query
                      ? 'Try another search term.'
                      : 'Add your first bookmark to begin building your digital vault.'}
                  </p>

                  {!query && (
                    <button
                      className="primary"
                      onClick={() =>
                        setModal(true)
                      }
                    >
                      <Plus size={16} />
                      Add first bookmark
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <div className="mobile-nav">
        {[
          ['all', 'Vault', Search],
          ['starred', 'Starred', Star],
          ['collections', 'Collections', Folder],
          ['settings', 'Settings', Settings],
        ].map(
          ([key, label, Icon]: any) => (
            <button
              className={
                view === key ? 'active' : ''
              }
              key={key}
              onClick={() => nav(key)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          )
        )}
      </div>

      <input
        ref={fileRef}
        hidden
        type="file"
        accept=".json,.html,text/html,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];

          if (file) {
            importFile(file);
          }
        }}
      />

      {modal && (
        <BookmarkModal
          bookmark={editing}
          collections={collections}
          tags={tags}
          links={bookmarkTags}
          collectionLinks={collectionLinks}
          onClose={() => {
            setModal(false);
            setEditing(null);
          }}
          onCreated={async () => {
            setModal(false);
            setEditing(null);
            await load();
          }}
        />
      )}

      {selected && (
        <Detail
          bookmark={selected}
          tags={bookmarkTags
            .filter(
              (x) =>
                x.bookmark_id === selected.id
            )
            .map((x) =>
              tagNames.get(x.tag_id)
            )
            .filter(Boolean) as string[]}
          collection={
            collectionLinks.find(
              (x) =>
                x.bookmark_id === selected.id
            )
              ? collectionNames.get(
                  collectionLinks.find(
                    (x) =>
                      x.bookmark_id ===
                      selected.id
                  )!.collection_id
                )
              : undefined
          }
          onClose={() =>
            setSelected(null)
          }
          onEdit={() => {
            setSelected(null);
            setEditing(selected);
            setModal(true);
          }}
        />
      )}

      {commandOpen && (
        <CommandPalette
          close={() =>
            setCommandOpen(false)
          }
          add={() => {
            setCommandOpen(false);
            setEditing(null);
            setModal(true);
          }}
          nav={nav}
          logout={logout}
          createCollection={() => {
            setCommandOpen(false);
            nav('collections');
          }}
          importBookmarks={openImport}
          exportBookmarks={() =>
            exportJson(payload)
          }
        />
      )}
    </div>
  );
}

function Stats({
  bookmarks,
  collections,
  tags,
}: {
  bookmarks: Bookmark[];
  collections: Collection[];
  tags: Tag[];
}) {
  return (
    <div className="stats">
      <div>
        <span>BOOKMARKS</span>
        <strong>{bookmarks.length}</strong>
      </div>

      <div>
        <span>STARRED</span>
        <strong>
          {
            bookmarks.filter(
              (x) => x.is_favorite
            ).length
          }
        </strong>
      </div>

      <div>
        <span>COLLECTIONS</span>
        <strong>{collections.length}</strong>
      </div>

      <div>
        <span>TAGS</span>
        <strong>{tags.length}</strong>
      </div>
    </div>
  );
}

function BookmarkCard({
  bookmark,
  tags,
  collection,
  onOpen,
  onFavorite,
  onDelete,
  onEdit,
  onSelect,
}: {
  bookmark: Bookmark;
  tags: string[];
  collection?: string;
  onOpen: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSelect: () => void;
}) {
  return (
    <article
      className="card"
      onClick={onSelect}
    >
      <div className="card-top">
        <div className="favicon">
          {bookmark.domain
            ?.slice(0, 1)
            .toUpperCase() || '↗'}
        </div>

        <button
          aria-label="Favorite"
          className={
            bookmark.is_favorite
              ? 'star active'
              : 'star'
          }
          onClick={(e) => {
            e.stopPropagation();
            onFavorite();
          }}
        >
          <Star
            size={17}
            fill={
              bookmark.is_favorite
                ? 'currentColor'
                : 'none'
            }
          />
        </button>
      </div>

      <h3>
        {bookmark.title ||
          bookmark.url}
      </h3>

      <div className="domain">
        {bookmark.domain ||
          bookmark.url}
      </div>

      {bookmark.description && (
        <p>{bookmark.description}</p>
      )}

      <div className="chips">
        {collection && (
          <span>
            ⌂ {collection}
          </span>
        )}

        {tags.slice(0, 3).map((tag) => (
          <span key={tag}>
            #{tag}
          </span>
        ))}
      </div>

      <div className="card-foot">
        <span>
          {formatRelative(
            bookmark.last_opened_at ||
              bookmark.created_at
          )}
        </span>

        <div>
          <button
            className="mini"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit"
          >
            <Edit3 size={14} />
          </button>

          <button
            className="mini"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard?.writeText(
                bookmark.url
              );
            }}
            title="Copy URL"
          >
            <Copy size={14} />
          </button>

          <button
            className="mini"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            title="Open"
          >
            <ExternalLink size={14} />
          </button>

          <button
            className="mini danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function BookmarkModal({
  bookmark,
  collections,
  tags,
  links,
  collectionLinks,
  onClose,
  onCreated,
}: {
  bookmark: Bookmark | null;
  collections: Collection[];
  tags: Tag[];
  links: BookmarkTag[];
  collectionLinks: CollectionBookmark[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [url, setUrl] = useState(
    bookmark?.url || ''
  );

  const [title, setTitle] = useState(
    bookmark?.title || ''
  );

  const [description, setDescription] =
    useState(
      bookmark?.description || ''
    );

  const [notes, setNotes] = useState(
    bookmark?.notes || ''
  );

  const [favorite, setFavorite] =
    useState(
      bookmark?.is_favorite || false
    );

  const [collectionId, setCollectionId] =
    useState(
      collectionLinks.find(
        (x) =>
          x.bookmark_id === bookmark?.id
      )?.collection_id || ''
    );

  const [selectedTags, setSelectedTags] =
    useState<string[]>(
      links
        .filter(
          (x) =>
            x.bookmark_id === bookmark?.id
        )
        .map((x) => x.tag_id)
    );

  const [busy, setBusy] =
    useState(false);

  const save = async () => {
    if (!url.trim()) return;

    setBusy(true);

    try {
      let saved: Bookmark;

      let domain: string | null = null;

      try {
        domain = new URL(url).hostname;
      } catch {
        domain = null;
      }

      if (bookmark) {
        saved =
          await bookmarksApi.update(
            bookmark.id,
            {
              url,
              title,
              description:
                description || null,
              notes: notes || null,
              is_favorite: favorite,
              domain,
            }
          );
      } else {
        saved =
          await bookmarksApi.create({
            url,
            title,
            description:
              description || null,
            notes: notes || null,
            is_favorite: favorite,
            domain,
          });
      }

      const oldTags = links
        .filter(
          (x) =>
            x.bookmark_id === saved.id
        )
        .map((x) => x.tag_id);

      for (
        const tagId of oldTags.filter(
          (id) =>
            !selectedTags.includes(id)
        )
      ) {
        await tagsApi.detach(
          saved.id,
          tagId
        );
      }

      for (
        const tagId of selectedTags.filter(
          (id) =>
            !oldTags.includes(id)
        )
      ) {
        await tagsApi.attach(
          saved.id,
          tagId
        );
      }

      const oldCollection =
        collectionLinks.find(
          (x) =>
            x.bookmark_id === saved.id
        )?.collection_id;

      if (
        oldCollection &&
        oldCollection !== collectionId
      ) {
        await collectionsApi.removeBookmark(
          oldCollection,
          saved.id
        );
      }

      if (
        collectionId &&
        oldCollection !== collectionId
      ) {
        await collectionsApi.addBookmark(
          collectionId,
          saved.id
        );
      }

      onCreated();
    } catch (e: any) {
      alert(
        e?.message ||
          'Unable to save bookmark.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">
              {bookmark
                ? 'EDIT SIGNAL'
                : 'NEW SIGNAL'}
            </p>

            <h2>
              {bookmark
                ? 'Edit bookmark'
                : 'Add bookmark'}
            </h2>
          </div>

          <button
            className="icon-btn"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <label>
          URL

          <input
            className="input"
            placeholder="https://example.com"
            value={url}
            onChange={(e) =>
              setUrl(e.target.value)
            }
          />
        </label>

        <label>
          Title

          <input
            className="input"
            value={title}
            onChange={(e) =>
              setTitle(e.target.value)
            }
          />
        </label>

        <label>
          Description

          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={(e) =>
              setDescription(
                e.target.value
              )
            }
          />
        </label>

        <label>
          Notes

          <textarea
            className="input"
            rows={2}
            placeholder="Private notes…"
            value={notes}
            onChange={(e) =>
              setNotes(e.target.value)
            }
          />
        </label>

        <label>
          Collection

          <select
            className="input"
            value={collectionId}
            onChange={(e) =>
              setCollectionId(
                e.target.value
              )
            }
          >
            <option value="">
              No collection
            </option>

            {collections.map(
              (collection) => (
                <option
                  key={collection.id}
                  value={collection.id}
                >
                  {collection.name}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          Tags

          <div className="tag-select">
            {tags.map((tag) => (
              <button
                type="button"
                className={
                  selectedTags.includes(
                    tag.id
                  )
                    ? 'tag-choice active'
                    : 'tag-choice'
                }
                key={tag.id}
                onClick={() =>
                  setSelectedTags(
                    (current) =>
                      current.includes(
                        tag.id
                      )
                        ? current.filter(
                            (id) =>
                              id !==
                              tag.id
                          )
                        : [
                            ...current,
                            tag.id,
                          ]
                  )
                }
              >
                #{tag.name}
              </button>
            ))}
          </div>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) =>
              setFavorite(
                e.target.checked
              )
            }
          />

          Mark as favorite
        </label>

        <div className="modal-actions">
          <button
            className="secondary"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="primary"
            disabled={busy || !url.trim()}
            onClick={save}
          >
            {busy
              ? 'Saving…'
              : bookmark
                ? 'Save changes'
                : 'Save bookmark'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({
  bookmark,
  tags,
  collection,
  onClose,
  onEdit,
}: {
  bookmark: Bookmark;
  tags: string[];
  collection?: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="detail">
      <button
        className="icon-btn"
        onClick={onClose}
      >
        <X size={18} />
      </button>

      <button
        className="secondary detail-edit"
        onClick={onEdit}
      >
        <Edit3 size={14} />
        Edit
      </button>

      <div className="detail-icon">
        {bookmark.domain
          ?.slice(0, 1)
          .toUpperCase() || 'N'}
      </div>

      <p className="eyebrow">
        SIGNAL DETAIL
      </p>

      <h2>
        {bookmark.title ||
          bookmark.url}
      </h2>

      <a
        href={bookmark.url}
        target="_blank"
        rel="noreferrer"
      >
        {bookmark.url}
      </a>

      {bookmark.description && (
        <p>{bookmark.description}</p>
      )}

      {collection && (
        <div className="chips">
          <span>⌂ {collection}</span>
        </div>
      )}

      {tags.length > 0 && (
        <div className="chips">
          {tags.map((tag) => (
            <span key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="detail-meta">
        <span>
          Added{' '}
          {new Date(
            bookmark.created_at
          ).toLocaleString()}
        </span>

        <span>
          Opened{' '}
          {formatRelative(
            bookmark.last_opened_at
          )}
        </span>
      </div>

      {bookmark.notes && (
        <div className="note">
          <b>Private note</b>
          <p>{bookmark.notes}</p>
        </div>
      )}
    </div>
  );
}

function CommandPalette({
  close,
  add,
  nav,
  logout,
  createCollection,
  importBookmarks,
  exportBookmarks,
}: any) {
  const commands = [
    ['Add bookmark', add, Plus],
    [
      'Search bookmarks',
      () => {
        close();
        nav('all');
      },
      Search,
    ],
    [
      'Open starred',
      () => {
        close();
        nav('starred');
      },
      Star,
    ],
    [
      'Open recent',
      () => {
        close();
        nav('recent');
      },
      Clock3,
    ],
    [
      'Create collection',
      createCollection,
      Folder,
    ],
    [
      'Import bookmarks',
      importBookmarks,
      Upload,
    ],
    [
      'Export bookmarks',
      exportBookmarks,
      Download,
    ],
    [
      'Settings',
      () => {
        close();
        nav('settings');
      },
      Settings,
    ],
    ['Logout', logout, LogOut],
  ];

  return (
    <div className="overlay">
      <div className="cmd-palette">
        <div className="cmd-search">
          <Command size={17} />

          <input
            autoFocus
            placeholder="Type a command…"
          />
        </div>

        {commands.map(
          ([label, fn, Icon]: any) => (
            <button
              key={label}
              className="cmd-item"
              onClick={fn}
            >
              <Icon size={17} />
              <span>{label}</span>
              <ChevronRight size={14} />
            </button>
          )
        )}
      </div>

      <button
        className="scrim"
        onClick={close}
      />
    </div>
  );
}

function CollectionPanel({
  collections,
  onCreate,
  onRefresh,
}: {
  collections: Collection[];
  onCreate: () => void;
  onRefresh: () => void;
}) {
  const edit = async (
    collection: Collection
  ) => {
    const name = prompt(
      'Collection name',
      collection.name
    );

    if (
      name?.trim() &&
      name !== collection.name
    ) {
      try {
        await collectionsApi.update(
          collection.id,
          {
            name: name.trim(),
          }
        );

        onRefresh();
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  const remove = async (
    collection: Collection
  ) => {
    if (
      confirm(
        `Delete collection “${collection.name}”? Bookmarks will remain.`
      )
    ) {
      await collectionsApi.remove(
        collection.id
      );

      onRefresh();
    }
  };

  return (
    <div>
      <div className="panel-actions">
        <button
          className="primary"
          onClick={onCreate}
        >
          <Plus size={16} />
          New collection
        </button>
      </div>

      <div className="collection-grid">
        {collections.map(
          (collection) => (
            <div
              className="collection-card"
              key={collection.id}
            >
              <Folder size={20} />

              <b>{collection.name}</b>

              <span>
                {collection.description ||
                  'Personal collection'}
              </span>

              <div className="card-actions">
                <button
                  className="mini"
                  onClick={() =>
                    edit(collection)
                  }
                >
                  <Edit3 size={14} />
                </button>

                <button
                  className="mini danger"
                  onClick={() =>
                    remove(collection)
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {!collections.length && (
        <div className="empty">
          <div className="empty-icon">
            <Folder />
          </div>

          <h3>
            Create your first collection.
          </h3>
        </div>
      )}
    </div>
  );
}

function TagPanel({
  tags,
  onRefresh,
}: {
  tags: Tag[];
  onRefresh: () => void;
}) {
  const create = async () => {
    const name = prompt('Tag name');

    if (name?.trim()) {
      try {
        await tagsApi.create(name);
        onRefresh();
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  const edit = async (tag: Tag) => {
    const name = prompt(
      'Tag name',
      tag.name
    );

    if (
      name?.trim() &&
      name !== tag.name
    ) {
      try {
        await tagsApi.update(
          tag.id,
          name
        );

        onRefresh();
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  const remove = async (tag: Tag) => {
    if (
      confirm(`Delete #${tag.name}?`)
    ) {
      await tagsApi.remove(tag.id);
      onRefresh();
    }
  };

  return (
    <div>
      <div className="panel-actions">
        <button
          className="primary"
          onClick={create}
        >
          <Plus size={16} />
          New tag
        </button>
      </div>

      <div className="tag-cloud">
        {tags.map((tag) => (
          <span
            className="tag-item"
            key={tag.id}
          >
            #{tag.name}

            <button
              onClick={() => edit(tag)}
            >
              <Edit3 size={12} />
            </button>

            <button
              onClick={() => remove(tag)}
            >
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>

      {!tags.length && (
        <div className="empty">
          <div className="empty-icon">
            <TagIcon />
          </div>

          <h3>No tags yet.</h3>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  profile,
  preferences,
  onPreferences,
  onLogout,
  onImport,
  onExportJson,
  onExportHtml,
}: {
  profile: Profile | null;
  preferences: UserPreferences | null;
  onPreferences: (
    preferences: UserPreferences
  ) => void;
  onLogout: () => void;
  onImport: () => void;
  onExportJson: () => void;
  onExportHtml: () => void;
}) {
  const save = async (
    changes: Partial<UserPreferences>
  ) => {
    try {
      const updated =
        await preferencesApi.update(
          changes
        );

      onPreferences(updated);
    } catch (e: any) {
      alert(
        e?.message ||
          'Unable to save customization.'
      );
    }
  };

  const reset = async () => {
    try {
      const updated =
        await preferencesApi.reset();

      onPreferences(updated);
    } catch (e: any) {
      alert(
        e?.message ||
          'Unable to reset customization.'
      );
    }
  };

  if (!preferences) {
    return (
      <div className="settings-panel">
        <div className="setting">
          <b>
            Loading customization…
          </b>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <div className="setting">
        <div>
          <b>Account</b>

          <span>
            Device vault: active
          </span>

          <span>
            User: {profile?.user_id || '—'}
          </span>
        </div>
      </div>

      <div className="setting">
        <div>
          <b>Customization</b>

          <span>
            Preferences are stored privately
            for your vault.
          </span>
        </div>

        <div className="setting-actions settings-controls">
          <label>
            Theme

            <select
              className="input"
              value={preferences.theme}
              onChange={(e) =>
                save({
                  theme:
                    e.target.value,
                })
              }
            >
              <option value="dark">
                Dark
              </option>

              <option value="light">
                Light
              </option>

              <option value="system">
                System
              </option>
            </select>
          </label>

          <label>
            Accent

            <select
              className="input"
              value={
                preferences.accent_color
              }
              onChange={(e) =>
                save({
                  accent_color:
                    e.target.value,
                })
              }
            >
              <option value="cyan">
                Cyan
              </option>

              <option value="violet">
                Violet
              </option>

              <option value="pink">
                Pink
              </option>

              <option value="lime">
                Lime
              </option>
            </select>
          </label>

          <label>
            Density

            <select
              className="input"
              value={preferences.density}
              onChange={(e) =>
                save({
                  density:
                    e.target.value,
                })
              }
            >
              <option value="comfortable">
                Comfortable
              </option>

              <option value="compact">
                Compact
              </option>

              <option value="spacious">
                Spacious
              </option>
            </select>
          </label>

          <label>
            Background

            <select
              className="input"
              value={
                preferences.background_style
              }
              onChange={(e) =>
                save({
                  background_style:
                    e.target.value,
                })
              }
            >
              <option value="grid">
                Grid
              </option>

              <option value="plain">
                Plain
              </option>

              <option value="aurora">
                Aurora
              </option>
            </select>
          </label>

          <label>
            Glow

            <input
              className="input"
              type="range"
              min="0"
              max="100"
              value={
                preferences.glow_intensity
              }
              onChange={(e) =>
                save({
                  glow_intensity:
                                        Number(e.target.value),
                })
              }
            />
          </label>
        </div>

        <div className="setting-actions">
          <button
            className="secondary"
            onClick={reset}
          >
            Reset customization
          </button>

          <button
            className="secondary"
            onClick={onImport}
          >
            Import
          </button>

          <button
            className="secondary"
            onClick={onExportJson}
          >
            Export JSON
          </button>

          <button
            className="secondary"
            onClick={onExportHtml}
          >
            Export HTML
          </button>

          <button
            className="danger"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
