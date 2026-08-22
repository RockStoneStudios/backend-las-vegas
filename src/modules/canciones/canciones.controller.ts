import { Elysia, t } from 'elysia';
import { getDb } from '../../shared/database/mongo.connection';
import { ObjectId } from 'mongodb';

export const cancionesController = new Elysia({ prefix: '/api/canciones' })

  // 1. Cliente solicita una canción
  .post('/solicitar', async ({ body, set }) => {
    const { cancion, autor, mesa } = body;

    if (!cancion || !autor || !mesa) {
      set.status = 400;
      return { error: 'Faltan datos: canción, autor o mesa' };
    }

    const db = getDb();
    const resultado = await db.collection('solicitudes_canciones').insertOne({
      cancion,
      autor,
      mesa,
      estado: 'pendiente',
      createdAt: new Date()
    });

    console.log(`🎵 Canción solicitada: ${cancion} - ${autor} (Mesa ${mesa})`);
    return { ok: true, id: resultado.insertedId };
  }, {
    body: t.Object({
      cancion: t.String(),
      autor: t.String(),
      mesa: t.Number()
    })
  })

  // 2. Admin obtiene todas las solicitudes pendientes
  .get('/pendientes', async () => {
    const db = getDb();
    const solicitudes = await db.collection('solicitudes_canciones')
      .find({ estado: 'pendiente' })
      .sort({ createdAt: -1 })
      .toArray();

    return { solicitudes };
  })

  // 3. Admin marca una canción como "ya puesta" o la elimina
  .post('/atender/:id', async ({ params, set }) => {
    const db = getDb();
    const { id } = params;
    const resultado = await db.collection('solicitudes_canciones')
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { estado: 'atendido', atendidoAt: new Date() } }
      );

    if (resultado.matchedCount === 0) {
      set.status = 404;
      return { error: 'Solicitud no encontrada' };
    }
    return { ok: true };
  });