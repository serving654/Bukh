import { supabase } from './supabase';

import type {
  Bookmark,
  Collection,
  Tag,
  Profile,
  UserPreferences
} from './types';

/* ─────────────────────────────────────────────
   SESSION
───────────────────────────────────────────── */

const currentUserId = async (): Promise<string> => {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) throw error;

  if (!user) {
    throw new Error('No active Bukh session.');
  }

  return user.id;
};

/* ─────────────────────────────────────────────
   DEVICE BOOTSTRAP
───────────────────────────────────────────── */

export const bootstrapDevice = async (device_id: string) => {
  const { data, error } = await supabase.functions.invoke(
    'bukh-bootstrap',
    {
      body: { device_id }
    }
  );

  if (error) throw error;

  if (!data?.success || !data?.data?.session) {
    throw new Error(
      data?.error?.message || 'Unable to initialize Bukh.'
    );
  }

  const { error: sessionError } =
    await supabase.auth.setSession(data.data.session);

  if (sessionError) throw sessionError;

  return data.data;
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

const domainFromUrl = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/* ─────────────────────────────────────────────
   BOOKMARKS
───────────────────────────────────────────── */

export const bookmarksApi = {
  list: async (): Promise<Bookmark[]> => {
    const user_id = await currentUserId();

    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data ?? [];
  },

  create: async (
    value: Partial<Bookmark> & { url: string }
  ): Promise<Bookmark> => {
    const user_id = await currentUserId();

    const payload = {
      ...value,
      user_id,
      url: value.url,
      title: value.title ?? '',
      domain: value.domain ?? domainFromUrl(value.url),
      is_favorite: value.is_favorite ?? false
    };

    const { data, error } = await supabase
      .from('bookmarks')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return data;
  },

  update: async (
    id: string,
    value: Partial<Bookmark>
  ): Promise<Bookmark> => {
    const user_id = await currentUserId();

    const payload = {
      ...value,
      title: value.title ?? ''
    };

    const { data, error } = await supabase
      .from('bookmarks')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) throw error;

    return data;
  },

  remove: async (id: string): Promise<void> => {
    const user_id = await currentUserId();

    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
  },

  open: async (id: string): Promise<void> => {
    const user_id = await currentUserId();

    const { error } = await supabase
      .from('bookmarks')
      .update({
        last_opened_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
  }
};

/* ─────────────────────────────────────────────
   COLLECTIONS
───────────────────────────────────────────── */

export const collectionsApi = {
  list: async (): Promise<Collection[]> => {
    const user_id = await currentUserId();

    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data ?? [];
  },

  create: async (
    value: Pick<Collection, 'name'> &
      Partial<Collection>
  ): Promise<Collection> => {
    const user_id = await currentUserId();

    const payload = {
      ...value,
      user_id
    };

    const { data, error } = await supabase
      .from('collections')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return data;
  },

  update: async (
    id: string,
    value: Partial<Collection>
  ): Promise<Collection> => {
    const user_id = await currentUserId();

    const { data, error } = await supabase
      .from('collections')
      .update(value)
      .eq('id', id)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) throw error;

    return data;
  },

  remove: async (id: string): Promise<void> => {
    const user_id = await currentUserId();

    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
  },

  addBookmark: async (
    collection_id: string,
    bookmark_id: string
  ): Promise<void> => {
    const user_id = await currentUserId();

    const { data: collection, error: collectionError } =
      await supabase
        .from('collections')
        .select('id')
        .eq('id', collection_id)
        .eq('user_id', user_id)
        .single();

    if (collectionError) throw collectionError;

    const { data: bookmark, error: bookmarkError } =
      await supabase
        .from('bookmarks')
        .select('id')
        .eq('id', bookmark_id)
        .eq('user_id', user_id)
        .single();

    if (bookmarkError) throw bookmarkError;

    const { error } = await supabase
      .from('collection_bookmarks')
      .upsert(
        {
          collection_id: collection.id,
          bookmark_id: bookmark.id
        },
        {
          onConflict: 'collection_id,bookmark_id'
        }
      );

    if (error) throw error;
  },

  removeBookmark: async (
    collection_id: string,
    bookmark_id: string
  ): Promise<void> => {
    const { error } = await supabase
      .from('collection_bookmarks')
      .delete()
      .eq('collection_id', collection_id)
      .eq('bookmark_id', bookmark_id);

    if (error) throw error;
  },

  links: async (): Promise<
    { collection_id: string; bookmark_id: string }[]
  > => {
    const { data, error } = await supabase
      .from('collection_bookmarks')
      .select('collection_id, bookmark_id');

    if (error) throw error;

    return data ?? [];
  }
};

/* ─────────────────────────────────────────────
   TAGS
───────────────────────────────────────────── */

export const tagsApi = {
  list: async (): Promise<Tag[]> => {
    const user_id = await currentUserId();

    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('user_id', user_id)
      .order('name', { ascending: true });

    if (error) throw error;

    return data ?? [];
  },

  create: async (name: string): Promise<Tag> => {
    const user_id = await currentUserId();

    const cleanName = name.trim();

    if (!cleanName) {
      throw new Error('Tag name cannot be empty.');
    }

    const { data, error } = await supabase
      .from('tags')
      .insert({
        name: cleanName,
        user_id
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  },

  update: async (
    id: string,
    name: string
  ): Promise<Tag> => {
    const user_id = await currentUserId();

    const cleanName = name.trim();

    if (!cleanName) {
      throw new Error('Tag name cannot be empty.');
    }

    const { data, error } = await supabase
      .from('tags')
      .update({
        name: cleanName
      })
      .eq('id', id)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) throw error;

    return data;
  },

  remove: async (id: string): Promise<void> => {
    const user_id = await currentUserId();

    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
  },

  attach: async (
    bookmark_id: string,
    tag_id: string
  ): Promise<void> => {
    const user_id = await currentUserId();

    const { data: bookmark, error: bookmarkError } =
      await supabase
        .from('bookmarks')
        .select('id')
        .eq('id', bookmark_id)
        .eq('user_id', user_id)
        .single();

    if (bookmarkError) throw bookmarkError;

    const { data: tag, error: tagError } =
      await supabase
        .from('tags')
        .select('id')
        .eq('id', tag_id)
        .eq('user_id', user_id)
        .single();

    if (tagError) throw tagError;

    const { error } = await supabase
      .from('bookmark_tags')
      .upsert(
        {
          bookmark_id: bookmark.id,
          tag_id: tag.id
        },
        {
          onConflict: 'bookmark_id,tag_id'
        }
      );

    if (error) throw error;
  },

  detach: async (
    bookmark_id: string,
    tag_id: string
  ): Promise<void> => {
    const { error } = await supabase
      .from('bookmark_tags')
      .delete()
      .eq('bookmark_id', bookmark_id)
      .eq('tag_id', tag_id);

    if (error) throw error;
  },

  links: async (): Promise<
    { bookmark_id: string; tag_id: string }[]
  > => {
    const { data, error } = await supabase
      .from('bookmark_tags')
      .select('bookmark_id, tag_id');

    if (error) throw error;

    return data ?? [];
  }
};

/* ─────────────────────────────────────────────
   PROFILE
───────────────────────────────────────────── */

export const profileApi = {
  get: async (): Promise<Profile | null> => {
    const user_id = await currentUserId();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle();

    if (error) throw error;

    return data;
  }
};

/* ─────────────────────────────────────────────
   USER PREFERENCES
───────────────────────────────────────────── */

export const preferencesApi = {
  get: async (): Promise<UserPreferences | null> => {
    const user_id = await currentUserId();

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle();

    if (error) throw error;

    return data;
  },

  update: async (
    value: Partial<UserPreferences>
  ): Promise<UserPreferences> => {
    const user_id = await currentUserId();

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          ...value,
          user_id
        },
        {
          onConflict: 'user_id'
        }
      )
      .select()
      .single();

    if (error) throw error;

    return data;
  },

  reset: async (): Promise<UserPreferences> => {
    const defaults = {
      theme: 'dark',
      accent_color: 'cyan',
      density: 'comfortable',
      background_style: 'grid',
      glow_intensity: 60,
      border_intensity: 60,
      sidebar_mode: 'expanded',
      bookmark_view: 'grid',
      reduced_motion: false
    };

    return preferencesApi.update(defaults);
  }
};
