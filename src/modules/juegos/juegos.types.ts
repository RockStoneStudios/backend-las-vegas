import type { ObjectId } from 'mongodb';

export type JuegoId =
  | 'ruleta'
  | 'cajones'
  | 'barra_clicks'
  | 'sismografo'
  | 'trivia'
  | 'mesa-que-mas-aplauda';

export type TipoJuego = 'global' | 'por_mesa';

export interface EstadoJuegoDB {
  _id?: ObjectId;
  juegoId: JuegoId;
  tipo: TipoJuego;
  mesaPermitida: number | null; // null si es 'global', o el # de mesa si es 'por_mesa'
  activo: boolean;
  createdAt: Date;
  datosEstado?: Record<string, unknown>; // Para guardar resultados de partidas
}

export interface IPremioConfig {
  id: string;
  nombre: string;
  pesoBase: number;
  esPremioMayor: boolean;
  color: string;    // <--- NUEVO (Ej: '#00f3ff')
  icono: string;    // <--- NUEVO (Ej: 'Beer', 'Sparkles', 'Wine')
}