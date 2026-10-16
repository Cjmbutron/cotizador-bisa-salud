// Función serverless de Vercel: la API NestJS compilada (npm run build la deja en apps/api/dist).
module.exports = require('../apps/api/dist/vercel.js').default;
