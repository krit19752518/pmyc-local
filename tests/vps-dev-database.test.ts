const originalEnv = {...process.env};
let options: any;
beforeEach(() => {
  jest.resetModules();
  delete process.env.FOOTBALL_VPS_DEV;
  delete process.env.FOOTBALL_DEV_DB_CA_FILE;
  delete process.env.FOOTBALL_DEV_DB_TLS_NAME;
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'fixture-url';
  jest.doMock('pg', () => ({Pool: jest.fn().mockImplementation(value => {
    options = value; return {on: jest.fn()};
  })}));
  jest.doMock('fs', () => ({__esModule: true, default: {readFileSync: jest.fn(() => Buffer.from('fixture-ca'))}}));
});
afterEach(() => {
  process.env = {...originalEnv};
  jest.dontMock('pg'); jest.dontMock('fs');
});
it('preserves normal Production connection settings', () => {
  process.env.NODE_ENV = 'production';
  jest.isolateModules(() => require('../src/db'));
  expect(options.max).toBe(10);
  expect(options.connectionString).toBe('fixture-url');
  expect(options.ssl).toBeUndefined();
});
it('uses the pinned CA and certificate name only for explicit VPS Dev', () => {
  Object.assign(process.env, {NODE_ENV: 'development', FOOTBALL_VPS_DEV: '1', FOOTBALL_DEV_DB_CA_FILE: '/fixture/ca.pem', FOOTBALL_DEV_DB_TLS_NAME: 'gritsolution'});
  jest.isolateModules(() => require('../src/db'));
  expect(options.max).toBe(3);
  expect(options.ssl).toEqual({ca: Buffer.from('fixture-ca'), servername: 'gritsolution', rejectUnauthorized: true});
});
it('refuses to activate the Dev override in Production mode', () => {
  Object.assign(process.env, {NODE_ENV: 'production', FOOTBALL_VPS_DEV: '1'});
  expect(() => jest.isolateModules(() => require('../src/db'))).toThrow('VPS Dev requires development mode');
});
