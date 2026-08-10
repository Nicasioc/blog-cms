import * as migration_20260810_015614_initial from './20260810_015614_initial';
import * as migration_20260810_022215_add_multi_tenant_and_seo from './20260810_022215_add_multi_tenant_and_seo';

export const migrations = [
  {
    up: migration_20260810_015614_initial.up,
    down: migration_20260810_015614_initial.down,
    name: '20260810_015614_initial',
  },
  {
    up: migration_20260810_022215_add_multi_tenant_and_seo.up,
    down: migration_20260810_022215_add_multi_tenant_and_seo.down,
    name: '20260810_022215_add_multi_tenant_and_seo'
  },
];
