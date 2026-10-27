export interface IPuja {
  mesa: number;
  monto: number;
  fecha?: Date;
}

export interface ISubasta {
  id: string;
  producto: string; // Ej: "Botella de Whisky"
  descripcion?: string;
  precioBase: number; // Ej: 150000
  precioActual: number;
  mesaGanadora?: number | null;
  cierraA: string; // Ej: "23:00" - solo aviso, el admin cierra manual
  estado: 'ACTIVA' | 'CERRADA';
  pujas: IPuja[];
  createdAt: Date;
  updatedAt: Date;
  cerradaEn?: Date;
}

export interface CreateSubastaDTO {
  producto: string;
  descripcion?: string;
  precioBase: number;
  cierraA: string;
}

export interface PujarDTO {
  mesa: number;
  monto: number;
}