export const REDIRECT_MAP = {
  web: process.env.WEB_PORTAL_URL ?? 'https://your-portal.com/auth/callback',
  cli: (port: string) => `http://localhost:${port}/callback`,
};
