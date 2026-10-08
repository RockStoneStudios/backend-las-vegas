// clean-test-data.ts
import { MongoClient } from 'mongodb';
import { ENV } from './src/shared/config/env';

const client = new MongoClient(ENV.MONGO_URI || 'mongodb://localhost:27017/lasvegas');

await client.connect();
const db = client.db();

const resultAlertas = await db.collection('alertas_mesero').deleteMany({
  usuarioId: /k6/,
});

const resultSesiones = await db.collection('usuarios_sesiones').deleteMany({
  sessionId: /k6/,
});

console.log(`✅ Alertas borradas: ${resultAlertas.deletedCount}`);
console.log(`✅ Sesiones borradas: ${resultSesiones.deletedCount}`);

const restantes = await db
  .collection('alertas_mesero')
  .countDocuments({ estado: 'pendiente' });

console.log(`📋 Alertas pendientes restantes: ${restantes}`);

await client.close();
process.exit(0);