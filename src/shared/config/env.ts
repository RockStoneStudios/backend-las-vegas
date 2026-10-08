export const ENV = {
  PORT: Number(process.env.PORT ?? 3001),

  // 🎯 Si NODE_ENV=test usa la DB de pruebas
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  MONGO_URI: process.env.MONGO_URI ?? 'mongodb://localhost:27017',
  MONGO_DB: process.env.MONGO_DB ?? 'las-vegas-discobar',

  MONGO_URI_TEST: process.env.MONGO_URI_TEST ?? 'mongodb://localhost:27017',
  MONGO_DB_TEST: process.env.MONGO_DB_TEST ?? 'las-vegas-test',

  MESA_HASH_SECRET: process.env.MESA_HASH_SECRET ?? 'vegas',
  JWT_SECRET: process.env.JWT_SECRET ?? 'secret_default',
  STAFF_SECRET: process.env.STAFF_SECRET ?? 'secret-mesero',
};