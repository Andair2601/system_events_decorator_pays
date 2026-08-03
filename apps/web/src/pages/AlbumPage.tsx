import { useEffect, useState } from "react";
import { TIPOS_EVENTO } from "@deco-eventos/core/src/db/enums.js";
import { api, ApiError, subirArchivoS3 } from "../api/client.js";
import type { AlbumFoto, Reserva } from "../types.js";

const initialForm = {
  categoria: TIPOS_EVENTO[0],
  reservaId: "",
  destacada: false,
};

export default function AlbumPage() {
  const [fotos, setFotos] = useState<AlbumFoto[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [form, setForm] = useState(initialForm);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function cargar() {
    try {
      setError(null);
      const data = await api.album.listar({ categoria: categoriaFiltro || undefined });
      setFotos(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el álbum");
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaFiltro]);

  useEffect(() => {
    api.reservas.listar().then(setReservas).catch(() => {});
  }, []);

  async function subir(ev: React.FormEvent) {
    ev.preventDefault();
    if (!archivo) {
      setError("Selecciona una foto primero");
      return;
    }
    setError(null);
    setSubiendo(true);
    try {
      const { uploadUrl, s3Key, publicUrl } = await api.uploads.obtenerUploadUrl(archivo.type);
      await subirArchivoS3(uploadUrl, archivo);
      await api.album.crear({
        categoria: form.categoria,
        s3Key,
        url: publicUrl,
        reservaId: form.reservaId ? Number(form.reservaId) : undefined,
        destacada: form.destacada,
      });
      setForm(initialForm);
      setArchivo(null);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
    }
  }

  async function alternarDestacada(foto: AlbumFoto) {
    setError(null);
    try {
      await api.album.actualizar(foto.id, { destacada: !foto.destacada });
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar la foto");
    }
  }

  async function eliminar(foto: AlbumFoto) {
    if (!confirm("¿Eliminar esta foto? Esta acción no se puede deshacer.")) return;
    setError(null);
    try {
      await api.album.eliminar(foto.id);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar la foto");
    }
  }

  return (
    <div>
      <h1>Álbum de fotos</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Subir foto</h2>
        <form onSubmit={subir} className="form-grid">
          <label>
            Foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label>
            Categoría
            <select
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value as typeof form.categoria })}
            >
              {TIPOS_EVENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reserva (opcional)
            <select
              value={form.reservaId}
              onChange={(e) => setForm({ ...form, reservaId: e.target.value })}
            >
              <option value="">Sin reserva asociada</option>
              {reservas.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} — {r.fechaEvento} — {r.lugar}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
            <input
              type="checkbox"
              checked={form.destacada}
              onChange={(e) => setForm({ ...form, destacada: e.target.checked })}
            />
            Destacada
          </label>
          <div className="actions-row">
            <button type="submit" disabled={subiendo}>
              {subiendo ? "Subiendo…" : "Subir foto"}
            </button>
          </div>
        </form>
      </div>

      <div className="toolbar">
        <label>
          Categoría
          <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
            <option value="">Todas</option>
            {TIPOS_EVENTO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="foto-grid">
        {fotos.map((f) => (
          <div className="foto-card" key={f.id}>
            <img src={f.url} alt={f.categoria} loading="lazy" />
            <div className="foto-card-body">
              <span className="badge">{f.categoria}</span>
              {f.destacada && <span className="badge success">destacada</span>}
              <div className="actions-row">
                <button type="button" className="secondary" onClick={() => alternarDestacada(f)}>
                  {f.destacada ? "Quitar destacada" : "Destacar"}
                </button>
                <button type="button" className="danger" onClick={() => eliminar(f)}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}
        {fotos.length === 0 && <p className="muted">No hay fotos que coincidan con el filtro.</p>}
      </div>
    </div>
  );
}
