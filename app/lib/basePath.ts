// Mirrors next.config.ts's basePath. Next adds it to <Link> and router URLs,
// but not to plain <img>/fetch paths, which must be prefixed by hand.
const rawPrefix = process.env.NEXT_PUBLIC_SUBPATH_PREFIX || '';
export const BASE_PATH = rawPrefix
  ? (rawPrefix.startsWith('/') ? rawPrefix : `/${rawPrefix}`).replace(/\/$/, '')
  : '';

export const withBasePath = (path: string) => `${BASE_PATH}${path}`;
