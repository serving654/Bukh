import { supabase } from './supabase';
import type {
  Bookmark,
  Collection,
  Tag,
  Profile,
  UserPreferences
} from './types';

/**
 * Get the currently authenticated Supabase user.
 * Bukh automatically creates/restores this session using bukh-bootstrap.
 */
const currentUserId = async (): Promise<string> => {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('No active Bukh session.');

  return user.id;
};

/**
 * Automatically bootstrap a device-specific Bukh account.
 */
export const bootstrapDevice = async (device_id: string) => {
  const { data, error } = await supabase.functions.invoke('bukh-bootstrap', {
    body: { device_id }
  });

  if (error) throw error;

  if (!data?.success || !data?.data?.session) {
    throw new Error(
      data?.error?.message || 'Unable to initialize Bukh.'
    );
  }

  const { error: sessionError } = await supabase.auth.setSession(
    data.data.session
  );

  if (sessionError) throw sessionError;

  return data.data;
};

/**
 * Generic Edge Function helper.
 * Kept for existing functionality such as metadata.
 */
const fn = async <T>(
  name: string,
  body: Record<string, unknown> = {}
) => {
  const { data, error } = await supabase.functions.invoke(name, {
    body
  });

  if (error) throw error;

  if (!data?.success) {
    throw new Error(
      data?.error?.message || 'Request failed'
    );
  }

  return data.data as T;
};

/*
 * Legacy authentication helpers.
 * Bukh no longer exposes login/signup in the UI.
 */
export const register = (
  user_id: string,
  password: string,
  confirm_password: string
) =>
  fn<{
    message: string;
    session: any;
    profile: Profile;
  }>('auth-register', {
    user_id,
    password,
    confirm_password
  });

export const login = async (
  user_id: string,
  password: string
) => {
  const d = await fn<{
    session: any;
    profile: Profile;
  }>('auth-login', {
    user_id,
    password
  });

  if (d.session) {
    const { error } = await supabase.auth.setSession(
      d.session
    );

    if (error) throw error;
  }

  return d.profile;
};

export const metadata = (url: string) =>
  fn<any>('metadata', { url });

export const deleteAccount = () =>
  fn<{ message: string }>('auth-delete-account');

export const logoutAll = () =>
  fn<{ message: string }>('auth-logout-all');

const domainFromUrl = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/* =========================================================
   BOOKMARKS
   ========================================================= */

export const bookmarksApi = {
  list: async () => {
    const {
      data,
      error
    } = await supabase
      .from('bookmarks')
      .select('*')
      .order('created_at', {
        ascending: false
      });

    if (error) throw error;

    return (data ?? []) as Bookmark[];
  },

  create: async (
    v: Partial<Bookmark> & { url: string }
  ) => {
    const user_id = await currentUserId();

    const payload = {
      ...v,
      user_id,
      title: v.title ?? '',
      domain:
        v.domain ??
        domainFromUrl(v.url)
    };

    const {
      data,
      error
    } = await supabase
      .from('bookmarks')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return data as Bookmark;
  },

  update: async (
    id: string,
    v: Partial<Bookmark>
  ) => {
    const {
      data,
      error
    } = await supabase
      .from('bookmarks')
      .update({
        ...v,
        title: v.title ?? ''
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return data as Bookmark;
  },

  remove: async (id: string) => {
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  open: async (id: string) => {
    const { error } = await supabase
      .from('bookmarks')
      .update({
        last_opened_at:
          new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
  }
};

/* =========================================================
   COLLECTIONS
   ========================================================= */

export const collectionsApi = {
  list: async () => {
    const {
      data,
      error
    } = await supabase
      .from('collections')
      .select('*')
      .order('name');

    if (error) throw error;

    return (data ?? []) as Collection[];
  },

  create: async (
    v: Pick<Collection, 'name'> &
      Partial<Collection>
  ) => {
    const user_id = await currentUserId();

    const payload = {
      ...v,
      user_id
    };

    const {
      data,
      error
    } = await supabase
      .from('collections')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return data as Collection;
  },

  update: async (
    id: string,
    v: Partial<Collection>
  ) => {
    const {
      data,
      error
    } = await supabase
      .from('collections')
      .update(v)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return data as Collection;
  },

  remove: async (id: string) => {
    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  addBookmark: async (
    collectionId: string,
    bookmarkId: string
  ) => {
    const { error } = await supabase
      .from('collection_bookmarks')
      .upsert({
        collection_id: collectionId,
        bookmark_id: bookmarkId
      });

    if (error) throw error;
  },

  removeBookmark: async (
    collectionId: string,
    bookmarkId: string
  ) => {
    const { error } = await supabase
      .from('collection_bookmarks')
      .delete()
      .eq('collection_id', collectionId)
      .eq('bookmark_id', bookmarkId);

    if (error) throw error;
  },

  links: async () => {
    const {
      data,
      error
    } = await supabase
      .from('collection_bookmarks')
      .select('*');

    if (error) throw error;

    return data ?? [];
  }
};

/* =========================================================
   TAGS
   ========================================================= */

export const tagsApi = {
  list: async () => {
    const {
      data,
      error
    } = await supabase
      .from('tags')
      .select('*')
      .order('name');

    if (error) throw error;

    return (data ?? []) as Tag[];
  },

  create: async (name: string) => {
    const user_id = await currentUserId();

    const {
      data,
      error
    } = await supabase
      .from('tags')
      .insert({
        name: name.trim(),
        user_id
      })
      .select()
      .single();

    if (error) throw error;

    return data as Tag;
  },

  update: async (
    id: string,
    name: string
  ) => {
    const {
      data,
      error
    } = await supabase
      .from('tags')
      .update({
        name: name.trim()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return data as Tag;
  },

  remove: async (id: string) => {
    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  attach: async (
    bookmarkId: string,
    tagId: string
  ) => {
    const { error } = await supabase
      .from('bookmark_tags')
      .upsert({
        bookmark_id: bookmarkId,
        tag_id: tagId
      });

    if (error) throw error;
  },

  detach: async (
    bookmarkId: string,
    tagId: string
  ) => {
    const { error } = await supabase
      .from('bookmark_tags')
      .delete()
      .eq('bookmark_id', bookmarkId)
      .eq('tag_id', tagId);

    if (error) throw error;
  },

  links: async () => {
    const {
      data,
      error
    } = await supabase
      .from('bookmark_tags')
      .select('*');

    if (error) throw error;

    return data ?? [];
  }
};

/* =========================================================
   PROFILE
   ========================================================= */

export const profileApi = {
  get: async () => {
    const {
      data,
      error
    } = await supabase
      .from('profiles')
      .select('*')
      .single();

    if (error) throw error;

    return data as Profile;
  }
};

/* =========================================================
   PREFERENCES
   ========================================================= */

export const preferencesApi = {
  get: async () => {
    const {
      data,
      error
    } = await supabase
      .from('user_preferences')
      .select('*')
      .single();

    if (error) throw error;

    return data as UserPreferences;
  },

  update: async (
    changes: Partial<UserPreferences>
  ) => {
    const {
      data,
      error
    } = await supabase
      .from('user_preferences')
      .update(changes)
      .select()
      .single();

    if (error) throw error;

    return data as UserPreferences;
  },

  reset: async () => {
    const defaults = {
      theme: 'dark',
      accent_color: 'cyan',
      density: 'comfortable',
      background_style: 'grid',

      // Database columns are INTEGER 0-100.
      glow_intensity: 60,
      border_intensity: 60,

      sidebar_mode: 'expanded',
      bookmark_view: 'grid',
      reduced_motion: false
    };

    return preferencesApi.update(
      defaults
    );
  }
};
