import { useEffect, useState } from "react";
import { MATERIAL_CATEGORIAS, MATERIAL_UNIDADES } from "@deco-eventos/core/src/db/enums.js";
import { api, ApiError, subirArchivoS3 } from "../api/client.js";
import type { Material } from "../types.js";

const initialForm = {
  nombre: "",
  categoria: MATERIAL_CATEGORIAS[0],
  costoUnitario: "",
  unidad: MATERIAL_UNIDADES[0],
  imagenUrl: "",
};

export default function MaterialesPage() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  async function cargar() {
    try {
      setError(null);
      const data = await api.materiales.listar({
        categoria: categoriaFiltro || undefined,
        incluirInactivos,
      });
      setMateriales(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el catálogo");
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaFiltro, incluirInactivos]);

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(initialForm);
    setArchivo(null);
  }

  function iniciarEdicion(m: Material) {
    setError(null);
    setEditandoId(m.id);
    setArchivo(null);
    setForm({
      nombre: m.nombre,
      categoria: m.categoria as typeof initialForm.categoria,
      costoUnitario: m.costoUnitario,
      unidad: m.unidad as typeof initialForm.unidad,
      imagenUrl: m.imagenUrl ?? "",
    });
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      let imagenUrl = form.imagenUrl || undefined;
      if (archivo) {
        const { uploadUrl, publicUrl } = await api.uploads.obtenerUploadUrl(archivo.type);
        await subirArchivoS3(uploadUrl, archivo);
        imagenUrl = publicUrl;
      }
      const datos = {
        nombre: form.nombre,
        categoria: form.categoria,
        costoUnitario: Number(form.costoUnitario),
        unidad: form.unidad,
        imagenUrl,
      };
      if (editandoId) {
        await api.materiales.actualizar(editandoId, datos);
      } else {
        await api.materiales.crear(datos);
      }
      cancelarEdicion();
      await cargar();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : `No se pudo ${editandoId ? "editar" : "crear"} el material`,
      );
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(m: Material) {
    setError(null);
    try {
      if (m.activo) await api.materiales.desactivar(m.id);
      else await api.materiales.reactivar(m.id);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar el material");
    }
  }

  async function eliminar(m: Material) {
    if (!confirm(`¿Eliminar "${m.nombre}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    try {
      await api.materiales.eliminar(m.id);
      if (editandoId === m.id) cancelarEdicion();
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar el material");
    }
  }

  return (
    <div>
      <h1>Catálogo de materiales</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>{editandoId ? `Editar material #${editandoId}` : "Nuevo material"}</h2>
        <form onSubmit={guardar} className="form-grid">
          <label>
            Nombre
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
          </label>
          <label>
            Categoría
            <select
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value as typeof form.categoria })}
            >
              {MATERIAL_CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Costo unitario
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.costoUnitario}
              onChange={(e) => setForm({ ...form, costoUnitario: e.target.value })}
              required
            />
          </label>
          <label>
            Unidad
            <select
              value={form.unidad}
              onChange={(e) => setForm({ ...form, unidad: e.target.value as typeof form.unidad })}
            >
              {MATERIAL_UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label>
            Foto (opcional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="actions-row">
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Agregar material"}
            </button>
            {editandoId && (
              <button type="button" className="secondary" onClick={cancelarEdicion}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="toolbar">
        <label>
          Categoría
          <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
            <option value="">Todas</option>
            {MATERIAL_CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
          />
          Incluir inactivos
        </label>
      </div>

      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Costo unitario</th>
            <th>Unidad</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {materiales.map((m) => (
            <tr key={m.id}>
              <td>
                {m.imagenUrl && (
                  <img
                    src={m.imagenUrl}
                    alt={m.nombre}
                    style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }}
                  />
                )}
              </td>
              <td>{m.nombre}</td>
              <td>{m.categoria}</td>
              <td>{m.costoUnitario}</td>
              <td>{m.unidad}</td>
              <td>
                <span className={`badge ${m.activo ? "success" : "danger"}`}>
                  {m.activo ? "activo" : "inactivo"}
                </span>
              </td>
              <td>
                <div className="actions-row">
                  <button type="button" className="secondary" onClick={() => iniciarEdicion(m)}>
                    Editar
                  </button>
                  <button type="button" className="secondary" onClick={() => alternarActivo(m)}>
                    {m.activo ? "Desactivar" : "Reactivar"}
                  </button>
                  <button type="button" className="danger" onClick={() => eliminar(m)}>
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {materiales.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No hay materiales que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
