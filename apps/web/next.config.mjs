/** El navegador habla solo con este servidor; /api/* se reenvía a la API interna (sin CORS, sin exponer su dirección). */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3000';
export default {
  poweredByHeader: false,
  async rewrites() { return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }]; },
};
