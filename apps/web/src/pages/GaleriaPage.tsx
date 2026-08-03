import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client.js";
import type { AlbumFoto } from "../types.js";

function agruparPorCategoria(fotos: AlbumFoto[]): [string, AlbumFoto[]][] {
  const grupos = new Map<string, AlbumFoto[]>();
  for (const foto of fotos) {
    const lista = grupos.get(foto.categoria) ?? [];
    lista.push(foto);
    grupos.set(foto.categoria, lista);
  }
  for (const lista of grupos.values()) {
    lista.sort((a, b) => Number(b.destacada) - Number(a.destacada));
  }
  return [...grupos.entries()];
}

export default function GaleriaPage() {
  const [fotos, setFotos] = useState<AlbumFoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.album
      .listar()
      .then(setFotos)
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar la galería"));
  }, []);

  const grupos = agruparPorCategoria(fotos);

  return (
    <div className="galeria">
      <header className="galeria-header">
        <span className="brand">BANANA DECOPARTY</span>
        <h1>Galería de eventos</h1>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {grupos.length === 0 && !error && <p className="muted">Todavía no hay fotos publicadas.</p>}

      {grupos.map(([categoria, fotosCategoria]) => (
        <section key={categoria} className="galeria-seccion">
          <h2>{categoria}</h2>
          <div className="foto-grid">
            {fotosCategoria.map((f) => (
              <div className={f.destacada ? "foto-card destacada" : "foto-card"} key={f.id}>
                <img src={f.url} alt={categoria} loading="lazy" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
