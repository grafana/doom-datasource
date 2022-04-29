import defaults from 'lodash/defaults';

import React, { PureComponent } from 'react';
import { InlineFieldRow, InlineSwitch, InlineField, Select } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from './datasource';
import { defaultQuery, MyDataSourceOptions, MyQuery, QueryType } from './types';

//@ts-ignore
type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

const queryTypes: Array<SelectableValue<QueryType>> = [
  {
    label: '-',
    value: QueryType.None,
    description: 'Nothing',
  },
  {
    label: 'Screen',
    value: QueryType.Screen,
    description: 'Time series for rendering screen using time series panel',
  },
  {
    label: 'Health',
    value: QueryType.health,
    description: 'Health',
  },
  {
    label: 'Current weapon ammo',
    value: QueryType.ammo,
    description: 'Ammo',
  },
  {
    label: 'Ammo per weapon',
    value: QueryType.ammoPerWeapon,
    description: 'Ammo per weapon',
  },
  {
    label: 'Armor',
    value: QueryType.armor,
    description: 'Armor',
  },
  {
    label: 'Selected Weapon',
    value: QueryType.weapon,
    description: 'Selected weapon',
  },
  {
    label: 'Kills',
    value: QueryType.kills,
    description: 'Kills',
  },
  {
    label: 'FPS',
    value: QueryType.fps,
    description: 'Frames Per Second',
  },
];

export class QueryEditor extends PureComponent<Props> {
  onQueryTypeChange = (sel: SelectableValue<QueryType>) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, queryType: sel.value! });
    onRunQuery();
  };

  onHalfRezChange = (evt: React.FormEvent<HTMLInputElement>) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, halfResolution: evt!.currentTarget.checked });
    onRunQuery();
  };

  render() {
    const query = defaults(this.props.query, defaultQuery);
    const { halfResolution } = query;

    return (
      <div>
        <InlineFieldRow>
          <InlineField label="Query type" grow={true} labelWidth={12}>
            <Select
              menuShouldPortal
              options={queryTypes}
              value={queryTypes.find((v) => v.value === query.queryType) || queryTypes[0]}
              onChange={this.onQueryTypeChange}
            />
          </InlineField>
        </InlineFieldRow>
        {query.queryType === QueryType.Screen && (
          <InlineFieldRow>
            <InlineSwitch
              showLabel={true}
              value={halfResolution}
              label="Half resolution"
              checked={halfResolution}
              onChange={this.onHalfRezChange}
            />
          </InlineFieldRow>
        )}
      </div>
    );
  }
}
