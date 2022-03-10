import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface MyQuery extends DataQuery {
  queryType: QueryType
  halfResolution: boolean
}

export enum Metric {
  ammo = 'ammo',
  health = 'health',
  armor = 'armor',
  armorType = 'armorType',
  ammoMax = 'ammoMax',
  weapon = 'weapon',
}


export enum QueryType {
  None = '',
  Screen = 'screen',
  ammo = 'ammo',
  health = 'health',
  armor = 'armor',
  armorType = 'armorType',
  ammoMax = 'ammoMax',
  weapon = 'weapon',
}

export const queryTypeToMetric = {
  [QueryType.ammo]: Metric.ammo,
  [QueryType.ammoMax]: Metric.ammoMax,
  [QueryType.health]: Metric.health,
  [QueryType.armor]: Metric.armor,
  [QueryType.armorType]: Metric.armorType,
  [QueryType.weapon]: Metric.weapon
}


export const defaultQuery: Partial<MyQuery> = {
  queryType: QueryType.None,
  halfResolution: false
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
