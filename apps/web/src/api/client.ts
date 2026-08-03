import type {
  AlbumFoto,
  Cliente,
  Cotizacion,
  CotizacionConItems,
  ConfiguracionCosteo,
  Material,
  Reserva,
} from "../types.js";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detalles?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Error ${res.status}`, res.status, body.detalles);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (usable.length === 0) return "";
  const search = new URLSearchParams(usable.map(([k, v]) => [k, String(v)]));
  return `?${search.toString()}`;
}

export const api = {
  materiales: {
    listar: (opts: { categoria?: string; incluirInactivos?: boolean } = {}) =>
      request<Material[]>(`/materiales${query(opts)}`),
    crear: (input: {
      nombre: string;
      categoria: string;
      costoUnitario: number;
      unidad: string;
    }) => request<Material>("/materiales", { method: "POST", body: JSON.stringify(input) }),
    actualizar: (id: number, input: Partial<{ nombre: string; categoria: string; costoUnitario: number; unidad: string }>) =>
      request<Material>(`/materiales/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    desactivar: (id: number) => request<Material>(`/materiales/${id}/desactivar`, { method: "POST" }),
    reactivar: (id: number) => request<Material>(`/materiales/${id}/reactivar`, { method: "POST" }),
    eliminar: (id: number) => request<void>(`/materiales/${id}`, { method: "DELETE" }),
  },

  clientes: {
    listar: () => request<Cliente[]>("/clientes"),
    crear: (input: { nombre: string; telefono: string; email?: string; notas?: string }) =>
      request<Cliente>("/clientes", { method: "POST", body: JSON.stringify(input) }),
  },

  configuracion: {
    obtener: () => request<ConfiguracionCosteo | null>("/configuracion"),
    guardar: (input: {
      tarifaManoObraHora: number;
      margenDefaultPct: number;
      tarifaTransporteDefault: number;
    }) => request<ConfiguracionCosteo>("/configuracion", { method: "PUT", body: JSON.stringify(input) }),
  },

  cotizaciones: {
    listar: (opts: { clienteId?: number; estado?: string } = {}) =>
      request<Cotizacion[]>(`/cotizaciones${query(opts)}`),
    obtener: (id: number) => request<CotizacionConItems>(`/cotizaciones/${id}`),
    crear: (input: {
      clienteId: number;
      nombreEvento: string;
      tipoEvento: string;
      items: { materialId: number; cantidad: number }[];
      horasManoObraEstimadas?: number;
      tarifaManoObraHora?: number;
      costoTransporte?: number;
      margenPct?: number;
      descuentoMonto?: number;
    }) =>
      request<CotizacionConItems>("/cotizaciones", { method: "POST", body: JSON.stringify(input) }),
    // Solo funciona si la cotización está en "borrador" (la API responde
    // 409 si no); el panel ya filtra el botón de editar por estado.
    actualizar: (
      id: number,
      input: {
        nombreEvento: string;
        tipoEvento: string;
        items: { materialId: number; cantidad: number }[];
        horasManoObraEstimadas?: number;
        tarifaManoObraHora?: number;
        costoTransporte?: number;
        margenPct?: number;
        descuentoMonto?: number;
      },
    ) =>
      request<CotizacionConItems>(`/cotizaciones/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    actualizarEstado: (id: number, estado: string) =>
      request<Cotizacion>(`/cotizaciones/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      }),
    pdfUrl: (id: number, vista: "interno" | "cliente" = "interno") =>
      `${API_URL}/cotizaciones/${id}/pdf${vista === "cliente" ? "?vista=cliente" : ""}`,
  },

  reservas: {
    listar: (opts: { desde?: string; hasta?: string; estado?: string } = {}) =>
      request<Reserva[]>(`/reservas${query(opts)}`),
    crear: (input: {
      cotizacionId: number;
      fechaEvento: string;
      horaEvento?: string;
      lugar: string;
      notas?: string;
    }) => request<Reserva>("/reservas", { method: "POST", body: JSON.stringify(input) }),
    actualizarEstado: (id: number, estado: string) =>
      request<Reserva>(`/reservas/${id}/estado`, { method: "PATCH", body: JSON.stringify({ estado }) }),
    registrarPago: (id: number, monto: number) =>
      request<Reserva>(`/reservas/${id}/pagos`, { method: "POST", body: JSON.stringify({ monto }) }),
  },

  album: {
    listar: (opts: { categoria?: string; destacada?: boolean; reservaId?: number } = {}) =>
      request<AlbumFoto[]>(`/album${query(opts)}`),
    crear: (input: {
      categoria: string;
      s3Key: string;
      url: string;
      reservaId?: number;
      destacada?: boolean;
    }) => request<AlbumFoto>("/album", { method: "POST", body: JSON.stringify(input) }),
    actualizar: (
      id: number,
      input: Partial<{ categoria: string; reservaId: number | null; destacada: boolean }>,
    ) => request<AlbumFoto>(`/album/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    eliminar: (id: number) => request<void>(`/album/${id}`, { method: "DELETE" }),
    obtenerUploadUrl: (contentType: string) =>
      request<{ uploadUrl: string; s3Key: string; publicUrl: string }>("/album/upload-url", {
        method: "POST",
        body: JSON.stringify({ contentType }),
      }),
  },
};

// Fuera de request(): esa función siempre manda Content-Type: application/json,
// que rompería la firma SigV4 de la URL prefirmada (tiene que coincidir
// exactamente con el contentType usado al pedirla). El navegador sube el
// archivo directo a S3, sin pasar por la API.
export async function subirArchivoS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!res.ok) throw new Error(`No se pudo subir el archivo (${res.status})`);
}
