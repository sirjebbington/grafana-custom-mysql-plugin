import { fireEvent, render, screen } from '@testing-library/react';

import { DataSourceSettings } from '@grafana/data';

import { MySQLOptions } from '../types';

import { ConfigurationEditor } from './ConfigurationEditor';

function makeOptions(jsonData: Partial<MySQLOptions> = {}): DataSourceSettings<MySQLOptions> {
  return {
    id: 1,
    uid: 'sr',
    orgId: 1,
    name: 'StarRocks',
    type: 'kotak-starrocks-datasource',
    typeName: 'StarRocks (IDAM identity)',
    typeLogoUrl: '',
    access: 'proxy',
    url: 'starrocks:9030',
    user: '',
    database: '',
    basicAuth: false,
    basicAuthUser: '',
    isDefault: false,
    withCredentials: false,
    readOnly: false,
    secureJsonFields: {},
    jsonData: jsonData as MySQLOptions,
  };
}

describe('ConfigurationEditor', () => {
  it('turns on oauthPassThru, which Grafana needs to forward the user token', () => {
    const onOptionsChange = jest.fn();
    render(<ConfigurationEditor options={makeOptions()} onOptionsChange={onOptionsChange} />);
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({ jsonData: expect.objectContaining({ oauthPassThru: true }) })
    );
  });

  it('does not touch options when oauthPassThru is already on', () => {
    const onOptionsChange = jest.fn();
    render(<ConfigurationEditor options={makeOptions({ oauthPassThru: true })} onOptionsChange={onOptionsChange} />);
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  it('has no username or password fields', () => {
    render(<ConfigurationEditor options={makeOptions({ oauthPassThru: true })} onOptionsChange={jest.fn()} />);
    expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
  });

  it('stores the token source', () => {
    const onOptionsChange = jest.fn();
    render(<ConfigurationEditor options={makeOptions({ oauthPassThru: true })} onOptionsChange={onOptionsChange} />);
    fireEvent.click(screen.getByLabelText('Access token'));
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({ jsonData: expect.objectContaining({ tokenSource: 'access_token' }) })
    );
  });

  it('stores connection limits as numbers', () => {
    const onOptionsChange = jest.fn();
    render(<ConfigurationEditor options={makeOptions({ oauthPassThru: true })} onOptionsChange={onOptionsChange} />);
    fireEvent.change(screen.getByPlaceholderText('5'), { target: { value: '3' } });
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({ jsonData: expect.objectContaining({ maxConnsPerUser: 3 }) })
    );
  });
});
