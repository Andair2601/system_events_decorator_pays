import { useEffect, useState } from "react";
import { COTIZACION_ESTADOS, TIPOS_EVENTO } from "@deco-eventos/core/src/db/enums.js";
import { api, ApiError } from "../api/client.js";
import type { Cliente, Cotizacion, CotizacionConItems, Material } from "../types.js";

interface ItemForm {
  materialId: string;
  cantidad: string;
}

const initialForm = {
  clienteId: "",
  nombreEvento: "",
  tipoEvento: TIPOS_EVENTO[0],
  horasManoObraEstimadas: "",
  tarifaManoObraHora: "",
  costoTransporte: "",
  margenPct: "",
};

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [form, setForm] = useState(initialForm);
  const [items, setItems] = useState<ItemForm[]>([{ materialId: "", cantidad: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [detalles, setDetalles] = useState<Record<number, CotizacionConItems>>({});

  async function cargarCotizaciones() {
    try {
      setError(null);
      setCotizaciones(await api.cotizaciones.listar({ estado: estadoFiltro || undefined }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar las cotizaciones");
    }
  }

  useEffect(() => {
    cargarCotizaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFiltro]);

  useEffect(() => {
    api.clientes.listar().then(setClientes).catch(() => undefined);
    api.materiales.listar().then(setMateriales).catch(() => undefined);
  }, []);

  function clienteNombre(id: number) {
    return clientes.find((c) => c.id === id)?.nombre ?? `#${id}`;
  }

  function materialNombre(id: number) {
    return materiales.find((m) => m.id === id)?.nombre ?? `#${id}`;
  }

  function actualizarItem(index: number, cambios: Partial<ItemForm>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...cambios } : it)));
  }

  function agregarItem() {
    setItems((prev) => [...prev, { materialId: "", cantidad: "" }]);
  }

  function quitarItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function crear(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await api.cotizaciones.crear({
        clienteId: Number(form.clienteId),
        nombreEvento: form.nombreEvento,
        tipoEvento: form.tipoEvento,
        items: items
          .filter((it) => it.materialId && it.cantidad)
          .map((it) => ({ materialId: Number(it.materialId), cantidad: Number(it.cantidad) })),
        horasManoObraEstimadas: form.horasManoObraEstimadas ? Number(form.horasManoObraEstimadas) : undefined,
        tarifaManoObraHora: form.tarifaManoObraHora ? Number(form.tarifaManoObraHora) : undefined,
        costoTransporte: form.costoTransporte ? Number(form.costoTransporte) : undefined,
        margenPct: form.margenPct ? Number(form.margenPct) : undefined,
      });
      setForm(initialForm);
      setItems([{ materialId: "", cantidad: "" }]);
      await cargarCotizaciones();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la cotización");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(id: number, estado: string) {
    setError(null);
    try {
      await api.cotizaciones.actualizarEstado(id, estado);
      await cargarCotizaciones();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar el estado");
    }
  }

  async function toggleDetalle(id: number) {
    if (detalles[id]) return;
    try {
      const detalle = await api.cotizaciones.obtener(id);
      setDetalles((prev) => ({ ...prev, [id]: detalle }));
    } catch {
      // el resumen ya se muestra en la fila; si falla el detalle no bloqueamos la vista
    }
  }

  return (
    <div>
      <h1>Cotizaciones</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Nueva cotización</h2>
        <form onSubmit={crear}>
          <div className="form-grid" style={{ marginBottom: "0.85rem" }}>
            <label>
              Cliente
              <select
                value={form.clienteId}
                onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
                required
              >
                <option value="">Selecciona…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombre del evento
              <input
                value={form.nombreEvento}
                onChange={(e) => setForm({ ...form, nombreEvento: e.target.value })}
                required
              />
            </label>
            <label>
              Tipo de evento
              <select
                value={form.tipoEvento}
                onChange={(e) => setForm({ ...form, tipoEvento: e.target.value as typeof form.tipoEvento })}
              >
                {TIPOS_EVENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h2>Materiales</h2>
          {items.map((it, i) => (
            <div className="item-row" key={i}>
              <select
                value={it.materialId}
                onChange={(e) => actualizarItem(i, { materialId: e.target.value })}
                required
              >
                <option value="">Selecciona material…</option>
                {materiales
                  .filter((m) => m.activo)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} ({m.costoUnitario}/{m.unidad})
                    </option>
                  ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Cantidad"
                value={it.cantidad}
                onChange={(e) => actualizarItem(i, { cantidad: e.target.value })}
                required
              />
              <button type="button" className="danger" onClick={() => quitarItem(i)} disabled={items.length === 1}>
                Quitar
              </button>
            </div>
          ))}
          <button type="button" className="secondary" onClick={agregarItem} style={{ marginBottom: "1rem" }}>
            + Agregar material
          </button>

          <h2>Overrides opcionales (si se omiten, usa configuración de costeo)</h2>
          <div className="form-grid" style={{ marginBottom: "1rem" }}>
            <label>
              Horas mano de obra
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.horasManoObraEstimadas}
                onChange={(e) => setForm({ ...form, horasManoObraEstimadas: e.target.value })}
              />
            </label>
            <label>
              Tarifa mano de obra / hora
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.tarifaManoObraHora}
                onChange={(e) => setForm({ ...form, tarifaManoObraHora: e.target.value })}
              />
            </label>
            <label>
              Costo transporte
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.costoTransporte}
                onChange={(e) => setForm({ ...form, costoTransporte: e.target.value })}
              />
            </label>
            <label>
              Margen (%)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.margenPct}
                onChange={(e) => setForm({ ...form, margenPct: e.target.value })}
              />
            </label>
          </div>

          <button type="submit" disabled={guardando}>
            {guardando ? "Calculando…" : "Generar cotización"}
          </button>
        </form>
      </div>

      <div className="toolbar">
        <label>
          Estado
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option value="">Todos</option>
            {COTIZACION_ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Evento</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Precio final</th>
            <th>Cambiar estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cotizaciones.map((c) => (
            <tr key={c.id}>
              <td>
                <details className="detail" onToggle={() => toggleDetalle(c.id)}>
                  <summary>{c.nombreEvento}</summary>
                  {detalles[c.id] ? (
                    <table style={{ marginTop: "0.5rem" }}>
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Cantidad</th>
                          <th>Costo unit.</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalles[c.id]!.items.map((it) => (
                          <tr key={it.id}>
                            <td>{materialNombre(it.materialId)}</td>
                            <td>{it.cantidad}</td>
                            <td>{it.costoUnitarioSnapshot}</td>
                            <td>{it.subtotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <span className="muted">Cargando…</span>
                  )}
                </details>
              </td>
              <td>{clienteNombre(c.clienteId)}</td>
              <td>
                <span className="badge">{c.estado}</span>
              </td>
              <td>{c.precioFinal}</td>
              <td>
                <select value={c.estado} onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                  {COTIZACION_ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <a className="btn secondary" href={api.cotizaciones.pdfUrl(c.id)} target="_blank" rel="noreferrer">
                  Descargar PDF
                </a>
              </td>
            </tr>
          ))}
          {cotizaciones.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No hay cotizaciones que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
