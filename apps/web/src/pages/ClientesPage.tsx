import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client.js";
import type { Cliente } from "../types.js";

const initialForm = { nombre: "", telefono: "", email: "", notas: "" };

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    try {
      setError(null);
      setClientes(await api.clientes.listar());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar la lista de clientes");
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await api.clientes.crear({
        nombre: form.nombre,
        telefono: form.telefono,
        email: form.email || undefined,
        notas: form.notas || undefined,
      });
      setForm(initialForm);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el cliente");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h1>Clientes</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Nuevo cliente</h2>
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
            Teléfono
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              placeholder="+51999111222"
              required
            />
          </label>
          <label>
            Email (opcional)
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Notas (opcional)
            <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </label>
          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Agregar cliente"}
          </button>
        </form>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Email</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td>{c.nombre}</td>
              <td>{c.telefono}</td>
              <td>{c.email ?? "—"}</td>
              <td>{c.notas ?? "—"}</td>
            </tr>
          ))}
          {clientes.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Todavía no hay clientes registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
