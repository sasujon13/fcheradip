/**
 * Use with: ng build --configuration=cloudflare
 * Same-origin API + media when Apache/nginx proxies /api and /media to Django
 * and Cloudflare Tunnel points cheradip.com → http://127.0.0.1:80
 */
export const environment = {
  production: true,
  apiUrl: '/api',
  backendUrl: '',
};
