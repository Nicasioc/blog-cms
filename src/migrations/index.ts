import * as migration_20260810_015614_initial from './20260810_015614_initial';
import * as migration_20260810_022215_add_multi_tenant_and_seo from './20260810_022215_add_multi_tenant_and_seo';
import * as migration_20260815_182859_add_content_html_fields from './20260815_182859_add_content_html_fields';
import * as migration_20260817_160641_add_featured_to_posts from './20260817_160641_add_featured_to_posts';

export const migrations = [
  {
    up: migration_20260810_015614_initial.up,
    down: migration_20260810_015614_initial.down,
    name: '20260810_015614_initial',
  },
  {
    up: migration_20260810_022215_add_multi_tenant_and_seo.up,
    down: migration_20260810_022215_add_multi_tenant_and_seo.down,
    name: '20260810_022215_add_multi_tenant_and_seo',
  },
  {
    up: migration_20260815_182859_add_content_html_fields.up,
    down: migration_20260815_182859_add_content_html_fields.down,
    name: '20260815_182859_add_content_html_fields',
  },
  {
    up: migration_20260817_160641_add_featured_to_posts.up,
    down: migration_20260817_160641_add_featured_to_posts.down,
    name: '20260817_160641_add_featured_to_posts'
  },
];
