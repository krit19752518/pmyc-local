import path from 'path';

/** Explicit development-only relocation; never changes production paths/startup. */
export function localContentRoot(defaultRoot: string): string {
  const configured=process.env.NODE_ENV==='development'?process.env.FOOTBALL_LOCAL_CONTENT_ROOT:undefined;
  if(!configured)return defaultRoot;
  if(!path.isAbsolute(configured))throw new Error('FOOTBALL_LOCAL_CONTENT_ROOT must be absolute');
  return path.resolve(configured);
}
export function skipLocalInitialization(): boolean {
  return process.env.NODE_ENV==='development' && process.env.FOOTBALL_LOCAL_SKIP_INIT==='true';
}
