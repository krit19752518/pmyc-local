import { localContentRoot, skipLocalInitialization } from '../src/services/localRuntime.service';
const original={...process.env};
afterEach(()=>{process.env={...original};});
it.each(['production','test',undefined])('ignores local content/init overrides in %s',mode=>{
  if(mode)process.env.NODE_ENV=mode;else delete process.env.NODE_ENV;
  process.env.FOOTBALL_LOCAL_CONTENT_ROOT='/tmp/fixture-root';process.env.FOOTBALL_LOCAL_SKIP_INIT='true';
  expect(localContentRoot('/app')).toBe('/app');expect(skipLocalInitialization()).toBe(false);
});
it('relocates development content without copying or inspecting user attachments',()=>{
  process.env.NODE_ENV='development';process.env.FOOTBALL_LOCAL_CONTENT_ROOT='/tmp/fixture-root';
  expect(localContentRoot('/app')).toBe('/tmp/fixture-root');expect(skipLocalInitialization()).toBe(false);
  process.env.FOOTBALL_LOCAL_SKIP_INIT='true';expect(skipLocalInitialization()).toBe(true);
});
it('rejects relative development roots',()=>{
  process.env.NODE_ENV='development';process.env.FOOTBALL_LOCAL_CONTENT_ROOT='../fixture';expect(()=>localContentRoot('/app')).toThrow('must be absolute');
});
