import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface MyQuery extends DataQuery {
  queryType: QueryType;
  halfResolution: boolean;
}

export enum Metric {
  ammo = 'ammo',
  health = 'health',
  armor = 'armor',
  weapon = 'weapon',
  ammoPerWeapon = 'ammoperweapon',
  kills = 'kills',
  fps = 'fps'
}

export interface AmmoValue {
  current: number;
  max: number;
}

export type AmmoType = 'cell' | 'clip' | 'missiles' | 'no' | 'shell';
export const ammoTypes: AmmoType[] = ['cell', 'clip', 'missiles', 'shell'];

export type WeaponType = 'bfg' | 'chaingun' | 'chainsaw' | 'fist' | 'missile' | 'pistol' | 'plasma' | 'shotgun' | 'supershotgun';

export interface WeaponValue {
  available: boolean;
  current: boolean;
  ammo: AmmoType
}
export interface MetricPayload {
  ammo: Record<AmmoType, AmmoValue>,
  armor: {
    count: number;
    type: number;
  },
  health: number;
  kills: number;
  weapons: Record<WeaponType, WeaponValue>
}

/*
ammo:
cell: {current: 0, max: 300}
clip: {current: 34, max: 200}
missiles: {current: 0, max: 50}
no: {current: Infinity, max: Infinity}
shell: {current: 8, max: 50}
[[Prototype]]: Object
armor: {count: 94, type: 1}
health: 83
kills: 6
weapons:
bfg: {available: false, current: false, ammo: 'cell'}
chaingun: {available: false, current: false, ammo: 'clip'}
chainsaw: {available: false, current: false, ammo: 'no'}
fist: {available: true, current: false, ammo: 'no'}
missile: {available: false, current: false, ammo: 'missiles'}
pistol: {available: true, current: false, ammo: 'clip'}
plasma: {available: false, current: false, ammo: 'cell'}
shotgun: {available: true, current: true, ammo: 'shell'}
supershotgun: {available: false, current: false, ammo: 'shell'}
[[Prototype]]: Object
[[Prototype]]: Object
*/

export enum QueryType {
  None = '',
  Screen = 'screen',
  ammo = 'ammo',
  health = 'health',
  armor = 'armor',
  weapon = 'weapon',
  ammoPerWeapon = 'ammoPerWeapon',
  kills = 'kills',
  fps  = 'fps'
}

export const queryTypeToMetric = {
  [QueryType.ammo]: Metric.ammo,
  [QueryType.ammoPerWeapon]: Metric.ammoPerWeapon,
  [QueryType.health]: Metric.health,
  [QueryType.armor]: Metric.armor,
  [QueryType.weapon]: Metric.weapon,
  [QueryType.kills]: Metric.kills,
  [QueryType.fps]: Metric.fps

};

export const defaultQuery: Partial<MyQuery> = {
  queryType: QueryType.None,
  halfResolution: false,
};

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  path?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  apiKey?: string;
}
