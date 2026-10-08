import { MongoClient, type Db } from 'mongodb';
import { ENV } from '../config/env';

// 🎯 Elige la URI según el entorno
const isTest = ENV.NODE_ENV === 'test';

const mongoUri = isTest ? ENV.MONGO_URI_TEST : ENV.MONGO_URI;
const mongoDbName = isTest ? ENV.MONGO_DB_TEST : ENV.MONGO_DB;

const client = new MongoClient(mongoUri.trim());
let dbInstance: Db;

export async function conectarMongo(): Promise<Db> {
  await client.connect();
  dbInstance = client.db(mongoDbName);

  await dbInstance
    .collection('usuarios_sesiones')
    .createIndex({ sessionId: 1 }, { unique: true });

  await dbInstance
    .collection('usuarios_sesiones')
    .createIndex(
      { mesa: 1, deviceId: 1, rol: 1 },
      {
        unique: true,
        partialFilterExpression: {
          rol: 'cliente',
          deviceId: { $exists: true },
        },
      }
    );

  await dbInstance
    .collection('usuarios_sesiones')
    .createIndex({ createdAt: 1 }, { expireAfterSeconds: 43200 });

  await dbInstance
    .collection('interacciones_mesas')
    .createIndex({ mesa: 1, estado: 1 });

  await dbInstance
    .collection('votaciones')
    .createIndex({ votacionId: 1 }, { unique: true });

  await dbInstance
    .collection('votaciones')
    .createIndex({ activa: 1, createdAt: -1 });

  console.log(`🗄️  MongoDB conectado: ${mongoDbName} (${isTest ? 'TEST' : 'PROD'})`);
  return dbInstance;
}

export function getDb(): Db {
  if (!dbInstance) {
    throw new Error('Mongo no está inicializado. Llama conectarMongo() antes de usar getDb().');
  }
  return dbInstance;
}