import { useEffect, useState } from "react";
import { MATERIAL_CATEGORIAS, MATERIAL_UNIDADES } from "@deco-eventos/core/src/db/enums.js";
import { api, ApiError } from "../api/client.js";
import type { Material } from "../types.js";

const initialForm = {
  nombre: "",
  categoria: MATERIAL_CATEGORIAS[0],
  costoUnitario: "",
  unidad: MATERIAL_UNIDADES[0],
};

export default function MaterialesPage() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

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

  async function crear(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await api.materiales.crear({
        nombre: form.nombre,
        categoria: form.categoria,
        costoUnitario: Number(form.costoUnitario),
        unidad: form.unidad,
      });
      setForm(initialForm);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el material");
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

  return (
    <div>
      <h1>Catálogo de materiales</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Nuevo material</h2>
        <form onSubmit={crear} className="form-grid">
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
          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Agregar material"}
          </button>
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
                <button className="secondary" onClick={() => alternarActivo(m)}>
                  {m.activo ? "Desactivar" : "Reactivar"}
                </button>
              </td>
            </tr>
          ))}
          {materiales.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
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
