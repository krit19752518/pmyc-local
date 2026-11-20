jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
    connect: jest.fn(),
    end: jest.fn()
  }
}));

jest.mock('../src/db/initTables', () => ({ initTeamTables: jest.fn(async () => undefined) }));

jest.mock('../src/adminAuth', () => {
  const actual = jest.requireActual('../src/adminAuth');
  return { ...actual, initAdminTables: jest.fn(async () => undefined) };
});

import fs from 'fs';

describe('application startup filesystem effects', () => {
  it('does not create upload directories while importing the app or upload middleware', () => {
    const mkdirSync = jest.spyOn(fs, 'mkdirSync');
    const mkdir = jest.spyOn(fs, 'mkdir');

    jest.isolateModules(() => {
      require('../src/app');
      require('../src/middleware/upload');
      require('../src/middleware/supportReportUpload');
    });

    expect(mkdirSync).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
  });
});
