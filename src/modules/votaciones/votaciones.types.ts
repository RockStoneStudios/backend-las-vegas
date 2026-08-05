import type { ObjectId } from 'mongodb';

export interface OpcionVotacion {
  id: number; // 1, 2, 3... o un string único
  texto: string;
  votos: number;
}

export interface VotoUsuario {
  sessionId: string; // O el número de mesa si votan por mesa
  opcionId: number;
  fecha: Date;
}

export interface EstadoVotacionDB {
  _id?: ObjectId;
  votacionId: string; // ID amigable (ej: 'votacion_dj_1')
  pregunta: string;
  opciones: OpcionVotacion[];
  votosUsuarios: VotoUsuario[];
  activa: boolean;
  createdAt: Date;
  closedAt?: Date | null;
}