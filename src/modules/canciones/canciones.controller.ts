import { Elysia, t } from 'elysia';
import { getDb } from '../../shared/database/mongo.connection';
import { ObjectId } from 'mongodb';

const MAX_POR_MESA_POR_TURNO = 2;

async function obtenerTurnoActivo(db: any) {
  return db.collection('turnos_canciones').findOne({ activo: true });
}

export const cancionesController = new Elysia({ prefix: '/api/canciones' })

  // 1. Cliente solicita una canción
  .post('/solicitar', async ({ body, set }) => {
    const { cancion, autor, mesa } = body;

    if (!cancion || !autor || !mesa) {
      set.status = 400;
      return { error: 'Faltan datos: canción, autor o mesa' };
    }

    const db = getDb();
    const turno = await obtenerTurnoActivo(db);

    if (!turno) {
      set.status = 403;
      return { error: 'El modo pedir canción no está activo' };
    }

    const turnoId = turno._id.toString();

    const usadas = await db.collection('solicitudes_canciones').countDocuments({
      mesa,
      turnoId,
      estado: { $ne: 'cancelado' },
    });

    if (usadas >= MAX_POR_MESA_POR_TURNO) {
      set.status = 429;
      return {
        error: `Ya pediste el máximo de ${MAX_POR_MESA_POR_TURNO} canciones en este turno`,
        usadas,
        limite: MAX_POR_MESA_POR_TURNO,
        restantes: 0,
      };
    }

    const resultado = await db.collection('solicitudes_canciones').insertOne({
      cancion,
      autor,
      mesa,
      turnoId,
      estado: 'pendiente',
      createdAt: new Date(),
    });

    const nuevasUsadas = usadas + 1;
    console.log(`🎵 ${cancion} - ${autor} (Mesa ${mesa}) [${nuevasUsadas}/${MAX_POR_MESA_POR_TURNO}]`);

    return {
      ok: true,
      id: resultado.insertedId,
      usadas: nuevasUsadas,
      restantes: MAX_POR_MESA_POR_TURNO - nuevasUsadas,
      limite: MAX_POR_MESA_POR_TURNO,
    };
  }, {
    body: t.Object({
      cancion: t.String(),
      autor: t.String(),
      mesa: t.Number(),
    }),
  })

  // 🆕 Estado del cupo de la mesa en el turno actual
  .get('/estado-mesa/:mesa', async ({ params }) => {
    const mesa = Number(params.mesa);
    const db = getDb();
    const turno = await obtenerTurnoActivo(db);

    if (!turno) {
      return { activo: false, usadas: 0, restantes: 0, limite: MAX_POR_MESA_POR_TURNO };
    }

    const usadas = await db.collection('solicitudes_canciones').countDocuments({
      mesa,
      turnoId: turno._id.toString(),
      estado: { $ne: 'cancelado' },
    });

    return {
      activo: true,
      usadas,
      restantes: Math.max(0, MAX_POR_MESA_POR_TURNO - usadas),
      limite: MAX_POR_MESA_POR_TURNO,
    };
  })

  // 2. Admin: pendientes del turno actual
  .get('/pendientes', async () => {
    const db = getDb();
    const turno = await obtenerTurnoActivo(db);

    const filtro: any = { estado: 'pendiente' };
    if (turno) filtro.turnoId = turno._id.toString();

    const solicitudes = await db.collection('solicitudes_canciones')
      .find(filtro)
      .sort({ createdAt: -1 })
      .toArray();

    return { solicitudes };
  })

  // 3. Admin marca atendida
  .post('/atender/:id', async ({ params, set }) => {
    const db = getDb();
    const { id } = params;
    const resultado = await db.collection('solicitudes_canciones').updateOne(
      { _id: new ObjectId(id) },
      { $set: { estado: 'atendido', atendidoAt: new Date() } }
    );

    if (resultado.matchedCount === 0) {
      set.status = 404;
      return { error: 'Solicitud no encontrada' };
    }
    return { ok: true };
  })// 🆕 7. Estado del modo global (para clientes que entran nuevos)
.get('/modo-activo', async () => {
  const db = getDb();
  const turno = await obtenerTurnoActivo(db);
  
  if (!turno) {
    return { activo: false, turnoId: null, iniciadoAt: null };
  }
  
  return {
    activo: true,
    turnoId: turno._id.toString(),
    iniciadoAt: turno.iniciadoAt,
  };
})

  // 🆕 4. Info del turno actual
  .get('/turno/actual', async () => {
    const db = getDb();
    const turno = await obtenerTurnoActivo(db);
    if (!turno) return { activo: false };

    const total = await db.collection('solicitudes_canciones').countDocuments({
      turnoId: turno._id.toString(),
      estado: { $ne: 'cancelado' },
    });

    return {
      activo: true,
      turnoId: turno._id.toString(),
      iniciadoAt: turno.iniciadoAt,
      totalSolicitudes: total,
    };
  });