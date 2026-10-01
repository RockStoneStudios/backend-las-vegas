import { t, Static } from 'elysia';

// Tipos de elementos admitidos en el plano (Nainayon ti PISTA_BAILE)
export type TipoElementoPlano = 'MESA' | 'BARRA' | 'ESCENARIO' | 'VIP' | 'PISTA_BAILE';

// Esquema Zod/TypeBox con Elysia para validación de entrada
export const CreateMesaSchema = t.Object({
  numero: t.String({ description: 'Identificador visible (ej: M1, BARRA_1, PISTA)' }),
  tipo: t.Union([
    t.Literal('MESA'),
    t.Literal('BARRA'),
    t.Literal('ESCENARIO'),
    t.Literal('VIP'),
    t.Literal('PISTA_BAILE'),
  ], { default: 'MESA' }),
  capacidad: t.Number({ default: 4 }),
  posX: t.Number({ default: 0 }),
  posY: t.Number({ default: 0 }),
  width: t.Number({ default: 64 }),
  height: t.Number({ default: 64 }),
  activa: t.Optional(t.Boolean({ default: true })),
});

// Esquema para actualizar posiciones en lote (Bulk Layout Update)
export const UpdateLayoutItemSchema = t.Object({
  id: t.String(),
  posX: t.Number(),
  posY: t.Number(),
  width: t.Number(),
  height: t.Number(),
});

export const UpdateLayoutSchema = t.Array(UpdateLayoutItemSchema);

// Inferencia de tipos de TypeScript
export type CreateMesaDTO = Static<typeof CreateMesaSchema>;
export type UpdateLayoutItemDTO = Static<typeof UpdateLayoutItemSchema>;

export interface IMesa {
  id?: string;
  numero: string;
  tipo: TipoElementoPlano;
  capacidad: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  activa: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}