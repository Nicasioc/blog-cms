import * as migration_20260810_015614_initial from './20260810_015614_initial';

export const migrations = [
  {
    up: migration_20260810_015614_initial.up,
    down: migration_20260810_015614_initial.down,
    name: '20260810_015614_initial'
  },
];
