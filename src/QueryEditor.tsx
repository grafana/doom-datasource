import defaults from 'lodash/defaults';

import React, {  PureComponent } from 'react';
import { InlineSwitch } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from './datasource';
import { defaultQuery, MyDataSourceOptions, MyQuery } from './types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

export class QueryEditor extends PureComponent<Props> {
  

  render() {
    const { onChange } = this.props
    const query = defaults(this.props.query, defaultQuery);
    const { halfResolution} = query;

    return (
      <div className="gf-form">
        <InlineSwitch showLabel={true} label="Half resolution" checked={halfResolution} onChange={evt => onChange({...query, halfResolution: evt!.currentTarget.checked}) } />
      </div>
    );
  }
}
