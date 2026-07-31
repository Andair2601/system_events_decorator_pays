import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client.js";

export default function ConfiguracionPage() {
  const [form, setForm] = useState({
    tarifaManoObraHora: "",
    margenDefaultPct: "",
    tarifaTransporteDefault: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.configuracion
      .obtener()
      .then((config) => {
        if (config) {
          setForm({
            tarifaManoObraHora: config.tarifaManoObraHora,
            margenDefaultPct: config.margenDefaultPct,
            tarifaTransporteDefault: config.tarifaTransporteDefault,
          });
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar la configuración"));
  }, []);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setMensaje(null);
    setGuardando(true);
    try {
      await api.configuracion.guardar({
        tarifaManoObraHora: Number(form.tarifaManoObraHora),
        margenDefaultPct: Number(form.margenDefaultPct),
        tarifaTransporteDefault: Number(form.tarifaTransporteDefault),
      });
      setMensaje("Configuración guardada.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la configuración");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h1>Configuración de costeo</h1>
      <p className="muted">
        Valores por defecto usados al generar una cotización cuando no se especifica un override
        puntual.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {mensaje && <div className="badge success" style={{ marginBottom: "1rem" }}>{mensaje}</div>}

      <div className="card">
        <form onSubmit={guardar} className="form-grid">
          <label>
            Tarifa mano de obra / hora
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.tarifaManoObraHora}
              onChange={(e) => setForm({ ...form, tarifaManoObraHora: e.target.value })}
              required
            />
          </label>
          <label>
            Margen por defecto (%)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.margenDefaultPct}
              onChange={(e) => setForm({ ...form, margenDefaultPct: e.target.value })}
              required
            />
          </label>
          <label>
            Transporte por defecto
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.tarifaTransporteDefault}
              onChange={(e) => setForm({ ...form, tarifaTransporteDefault: e.target.value })}
              required
            />
          </label>
          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </form>
      </div>
    </div>
  );
}
