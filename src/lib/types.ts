export type Bookmark={id:string;user_id:string;url:string;title:string|null;description:string|null;favicon_url:string|null;domain:string|null;image_url:string|null;notes:string|null;is_favorite:boolean;created_at:string;updated_at:string;last_opened_at:string|null};
export type Collection={id:string;user_id:string;name:string;description:string|null;icon:string|null;created_at:string;updated_at:string};
export type Tag={id:string;user_id:string;name:string;created_at:string};
export type BookmarkTag={bookmark_id:string;tag_id:string};
export type CollectionBookmark={collection_id:string;bookmark_id:string};
export type Profile={id:string;user_id:string;created_at:string;updated_at:string};
export type UserPreferences={user_id:string;theme:string;accent_color:string;density:string;background_style:string;glow_intensity:string;border_intensity:string;sidebar_mode:string;bookmark_view:string;reduced_motion:boolean;created_at:string;updated_at:string};
