import { MongoClient, type Db } from 'mongodb';
import { ENV } from '../config/env';

// Limpiamos la URI por si viene con espacios accidentales
const mongoUri = (ENV.MONGO_URI || '').trim();

if (!mongoUri) {
  throw new Error('❌ MONGO_URI no está definida en el archivo .env');
}

const client = new MongoClient(mongoUri);
let dbInstance: Db;

export async function conectarMongo(): Promise<Db> {
  await client.connect();
  dbInstance = client.db(ENV.MONGO_DB);

  await dbInstance
    .collection('usuarios_sesiones')
    .createIndex({ sessionId: 1 }, { unique: true });

  await dbInstance
    .collection('usuarios_sesiones')
    .createIndex({ createdAt: 1 }, { expireAfterSeconds: 43200 }); // 12h

  await dbInstance
    .collection('interacciones_mesas')
    .createIndex({ mesa: 1, estado: 1 });

  await dbInstance
    .collection('estado_votaciones')
    .createIndex({ votacionId: 1 }, { unique: true });

  await dbInstance
    .collection('estado_votaciones')
    .createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24h

  console.log('🗄️  MongoDB conectado:', ENV.MONGO_DB);
  return dbInstance;
}

export function getDb(): Db {
  if (!dbInstance) {
    throw new Error('Mongo no está inicializado. Llama conectarMongo() antes de usar getDb().');
  }
  return dbInstance;
}