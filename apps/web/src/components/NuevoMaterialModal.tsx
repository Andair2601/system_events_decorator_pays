import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MATERIAL_CATEGORIAS, MATERIAL_UNIDADES } from "@deco-eventos/core/src/db/enums.js";
import { api, ApiError, subirArchivoS3 } from "../api/client.js";
import type { Material } from "../types.js";

interface NuevoMaterialModalProps {
  onCreado: (material: Material) => void;
  onClose: () => void;
}

const initialForm = {
  nombre: "",
  categoria: MATERIAL_CATEGORIAS[0],
  costoUnitario: "",
  unidad: MATERIAL_UNIDADES[0],
};

// Alta rápida de un material sin salir de la pantalla actual (ej. a mitad de
// una cotización). Se renderiza en un portal para no quedar anidado dentro de
// otro <form>.
export default function NuevoMaterialModal({ onCreado, onClose }: NuevoMaterialModalProps) {
  const [form, setForm] = useState(initialForm);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    // Los eventos de un portal burbujean por el árbol de React hasta el <form>
    // padre (la cotización); sin esto se enviaría también ese formulario.
    ev.stopPropagation();
    setError(null);
    setGuardando(true);
    try {
      let imagenUrl: string | undefined;
      if (archivo) {
        const { uploadUrl, publicUrl } = await api.uploads.obtenerUploadUrl(archivo.type);
        await subirArchivoS3(uploadUrl, archivo);
        imagenUrl = publicUrl;
      }
      const material = await api.materiales.crear({
        nombre: form.nombre,
        categoria: form.categoria,
        costoUnitario: Number(form.costoUnitario),
        unidad: form.unidad,
        imagenUrl,
      });
      onCreado(material);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el material");
    } finally {
      setGuardando(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Nuevo material</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={guardar} className="form-grid">
          <label>
            Nombre
            <input
              autoFocus
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
              {guardando ? "Guardando…" : "Agregar material"}
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
