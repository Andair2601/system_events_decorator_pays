import { useEffect, useState } from "react";
import { RESERVA_ESTADOS } from "@deco-eventos/core/src/db/enums.js";
import { api, ApiError } from "../api/client.js";
import type { Cliente, Cotizacion, Reserva } from "../types.js";

const initialForm = { cotizacionId: "", fechaEvento: "", horaEvento: "", lugar: "", notas: "" };

export default function ReservasPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cotizacionesAceptadas, setCotizacionesAceptadas] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtros, setFiltros] = useState({ desde: "", hasta: "", estado: "" });
  const [form, setForm] = useState(initialForm);
  const [pagos, setPagos] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargarReservas() {
    try {
      setError(null);
      setReservas(
        await api.reservas.listar({
          desde: filtros.desde || undefined,
          hasta: filtros.hasta || undefined,
          estado: filtros.estado || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar las reservas");
    }
  }

  useEffect(() => {
    cargarReservas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  useEffect(() => {
    api.cotizaciones.listar({ estado: "aceptada" }).then(setCotizacionesAceptadas).catch(() => undefined);
    api.clientes.listar().then(setClientes).catch(() => undefined);
  }, []);

  function clienteNombre(id: number) {
    return clientes.find((c) => c.id === id)?.nombre ?? `#${id}`;
  }

  async function crear(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await api.reservas.crear({
        cotizacionId: Number(form.cotizacionId),
        fechaEvento: form.fechaEvento,
        horaEvento: form.horaEvento || undefined,
        lugar: form.lugar,
        notas: form.notas || undefined,
      });
      setForm(initialForm);
      await cargarReservas();
      api.cotizaciones.listar({ estado: "aceptada" }).then(setCotizacionesAceptadas).catch(() => undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la reserva");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(id: number, estado: string) {
    setError(null);
    try {
      await api.reservas.actualizarEstado(id, estado);
      await cargarReservas();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar el estado");
    }
  }

  async function registrarPago(id: number) {
    const monto = Number(pagos[id]);
    if (!monto || monto <= 0) return;
    setError(null);
    try {
      await api.reservas.registrarPago(id, monto);
      setPagos((prev) => ({ ...prev, [id]: "" }));
      await cargarReservas();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar el pago");
    }
  }

  return (
    <div>
      <h1>Reservas</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Nueva reserva</h2>
        <p className="muted">Solo se puede reservar a partir de una cotización aceptada.</p>
        <form onSubmit={crear} className="form-grid">
          <label>
            Cotización aceptada
            <select
              value={form.cotizacionId}
              onChange={(e) => setForm({ ...form, cotizacionId: e.target.value })}
              required
            >
              <option value="">Selecciona…</option>
              {cotizacionesAceptadas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombreEvento} — {clienteNombre(c.clienteId)} ({c.precioFinal})
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha del evento
            <input
              type="date"
              value={form.fechaEvento}
              onChange={(e) => setForm({ ...form, fechaEvento: e.target.value })}
              required
            />
          </label>
          <label>
            Hora (opcional)
            <input
              type="time"
              value={form.horaEvento}
              onChange={(e) => setForm({ ...form, horaEvento: e.target.value })}
            />
          </label>
          <label>
            Lugar
            <input
              value={form.lugar}
              onChange={(e) => setForm({ ...form, lugar: e.target.value })}
              required
            />
          </label>
          <label>
            Notas (opcional)
            <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </label>
          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Crear reserva"}
          </button>
        </form>
      </div>

      <div className="toolbar">
        <label>
          Desde
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
          />
        </label>
        <label>
          Estado
          <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
            <option value="">Todos</option>
            {RESERVA_ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Lugar</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Pago</th>
            <th>Registrar pago</th>
          </tr>
        </thead>
        <tbody>
          {reservas.map((r) => (
            <tr key={r.id}>
              <td>
                {r.fechaEvento}
                {r.horaEvento ? ` ${r.horaEvento}` : ""}
              </td>
              <td>{r.lugar}</td>
              <td>{clienteNombre(r.clienteId)}</td>
              <td>
                <select value={r.estado} onChange={(e) => cambiarEstado(r.id, e.target.value)}>
                  {RESERVA_ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <div>
                  <span
                    className={`badge ${r.estadoPago === "pagado" ? "success" : r.estadoPago === "parcial" ? "warning" : ""}`}
                  >
                    {r.estadoPago}
                  </span>
                </div>
                {r.montoTotal ? (
                  <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                    S/ {r.montoPagado} de S/ {r.montoTotal}
                    {r.estadoPago !== "pagado" && r.montoPendiente && (
                      <>
                        {" "}
                        · pendiente S/ {r.montoPendiente}
                      </>
                    )}
                  </div>
                ) : (
                  <span className="muted">{r.montoPagado}</span>
                )}
              </td>
              <td>
                <div className="inline-form">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Monto"
                    value={pagos[r.id] ?? ""}
                    onChange={(e) => setPagos((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    disabled={r.estadoPago === "pagado"}
                    style={{ width: "6rem" }}
                  />
                  <button
                    className="secondary"
                    onClick={() => registrarPago(r.id)}
                    disabled={r.estadoPago === "pagado"}
                  >
                    Registrar
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {reservas.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No hay reservas que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
