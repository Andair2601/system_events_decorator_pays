import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client.js";
import type { ReservaDetalle } from "../types.js";

export default function ReservaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const reservaId = Number(id);
  const navigate = useNavigate();

  const [detalle, setDetalle] = useState<ReservaDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevoItem, setNuevoItem] = useState({ descripcion: "", cantidad: "" });
  const [agregando, setAgregando] = useState(false);

  async function cargar() {
    try {
      setError(null);
      setDetalle(await api.reservas.detalle(reservaId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar la reserva");
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservaId]);

  async function eliminarReserva() {
    if (!confirm("¿Eliminar esta reserva? Esta acción no se puede deshacer.")) return;
    setError(null);
    try {
      await api.reservas.eliminar(reservaId);
      navigate("/reservas");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar la reserva");
    }
  }

  async function alternarCompletado(itemId: number, completado: boolean) {
    setError(null);
    try {
      await api.reservas.actualizarItem(reservaId, itemId, { completado });
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar el ítem");
    }
  }

  async function eliminarItem(itemId: number) {
    if (!confirm("¿Eliminar este ítem adicional?")) return;
    setError(null);
    try {
      await api.reservas.eliminarItem(reservaId, itemId);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar el ítem");
    }
  }

  async function agregarItem(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setAgregando(true);
    try {
      await api.reservas.agregarItem(reservaId, {
        descripcion: nuevoItem.descripcion,
        cantidad: nuevoItem.cantidad ? Number(nuevoItem.cantidad) : undefined,
      });
      setNuevoItem({ descripcion: "", cantidad: "" });
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo agregar el ítem");
    } finally {
      setAgregando(false);
    }
  }

  if (!detalle) {
    return (
      <div>
        <h1>Reserva #{id}</h1>
        {error ? <div className="error-banner">{error}</div> : <p className="muted">Cargando…</p>}
      </div>
    );
  }

  return (
    <div>
      <h1>Reserva #{detalle.id}</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Datos de la reserva</h2>
        <p>
          {detalle.fechaEvento}
          {detalle.horaEvento ? ` ${detalle.horaEvento}` : ""} — {detalle.lugar}
        </p>
        <p>
          Estado: <span className="badge">{detalle.estado}</span>{" "}
          Pago:{" "}
          <span
            className={`badge ${detalle.estadoPago === "pagado" ? "success" : detalle.estadoPago === "parcial" ? "warning" : ""}`}
          >
            {detalle.estadoPago}
          </span>
        </p>
        {detalle.montoTotal && (
          <p className="muted">
            S/ {detalle.montoPagado} de S/ {detalle.montoTotal}
            {detalle.estadoPago !== "pagado" && detalle.montoPendiente && (
              <> · pendiente S/ {detalle.montoPendiente}</>
            )}
          </p>
        )}
        <button type="button" className="danger" onClick={eliminarReserva}>
          Eliminar reserva
        </button>
      </div>

      <div className="card">
        <h2>Cotización asociada</h2>
        {detalle.cotizacion ? (
          <p>
            {detalle.cotizacion.nombreEvento} ({detalle.cotizacion.tipoEvento}) — S/{" "}
            {detalle.cotizacion.precioFinal} — <span className="badge">{detalle.cotizacion.estado}</span>
          </p>
        ) : (
          <p className="muted">Esta reserva no tiene una cotización asociada.</p>
        )}
      </div>

      <div className="card">
        <h2>Checklist de materiales</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Origen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {detalle.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.completado}
                      onChange={(e) => alternarCompletado(item.id, e.target.checked)}
                    />
                  </td>
                  <td style={{ textDecoration: item.completado ? "line-through" : undefined }}>
                    {item.descripcion}
                  </td>
                  <td>{item.cantidad ?? "—"}</td>
                  <td>
                    <span className="badge">{item.origen === "cotizacion" ? "fijo" : "adicional"}</span>
                  </td>
                  <td>
                    {item.origen === "adicional" && (
                      <button type="button" className="danger" onClick={() => eliminarItem(item.id)}>
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {detalle.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin ítems todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={agregarItem} className="inline-form" style={{ marginTop: "1rem" }}>
          <input
            placeholder="Descripción del ítem adicional"
            value={nuevoItem.descripcion}
            onChange={(e) => setNuevoItem({ ...nuevoItem, descripcion: e.target.value })}
            required
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Cantidad (opcional)"
            value={nuevoItem.cantidad}
            onChange={(e) => setNuevoItem({ ...nuevoItem, cantidad: e.target.value })}
            style={{ width: "8rem" }}
          />
          <button type="submit" disabled={agregando}>
            {agregando ? "Agregando…" : "+ Agregar ítem"}
          </button>
        </form>
      </div>
    </div>
  );
}
