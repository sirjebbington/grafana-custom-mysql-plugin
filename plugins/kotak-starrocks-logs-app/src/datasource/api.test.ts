import { friendlyError } from './api';

jest.mock('@grafana/runtime', () => ({}));

describe('friendlyError', () => {
  it('explains Ranger and login rejections and keeps the original text', () => {
    expect(friendlyError('Error 5204 (42000): Access denied')).toMatch(
      /^Access denied by Ranger \(5204\)\..*Error 5204/
    );
    expect(friendlyError('db query error: invalid connection')).toMatch(
      /no access to any log view.*invalid connection/
    );
    expect(friendlyError('something else')).toBe('something else');
  });
});
