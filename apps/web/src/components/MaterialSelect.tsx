import { useEffect, useMemo, useRef, useState } from "react";
import type { Material } from "../types.js";

interface MaterialSelectProps {
  materiales: Material[];
  value: string; // id del material seleccionado, o "" si no hay
  onChange: (materialId: string) => void;
}

// Sin tildes y en minúsculas, para que "globo latex" encuentre "Globo látex".
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function etiqueta(m: Material) {
  return `${m.nombre} (${m.costoUnitario}/${m.unidad})`;
}

// Selector de material con búsqueda: se escribe parte del nombre y la lista
// se filtra, en vez de recorrer un <select> larguísimo con scroll.
export default function MaterialSelect({ materiales, value, onChange }: MaterialSelectProps) {
  const seleccionado = materiales.find((m) => String(m.id) === value);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return materiales;
    return materiales.filter((m) => normalizar(m.nombre).includes(q));
  }, [materiales, busqueda]);

  useEffect(() => {
    setResaltado(0);
  }, [busqueda]);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) cerrar();
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setBusqueda("");
  }

  function elegir(m: Material) {
    onChange(String(m.id));
    cerrar();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setResaltado((r) => Math.min(r + 1, filtrados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((r) => Math.max(r - 1, 0));
    } else if (e.key === "Enter" && abierto) {
      // Enter dentro del buscador no debe enviar el formulario de la cotización.
      e.preventDefault();
      const m = filtrados[resaltado];
      if (m) elegir(m);
    } else if (e.key === "Escape") {
      cerrar();
    }
  }

  return (
    <div className="material-select" ref={contenedor}>
      <input
        type="text"
        placeholder="Busca o selecciona material…"
        value={abierto ? busqueda : seleccionado ? etiqueta(seleccionado) : ""}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setBusqueda(e.target.value);
          setAbierto(true);
          // Al volver a escribir, la selección anterior deja de valer.
          if (value) onChange("");
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {/* Input oculto solo para que "required" bloquee el envío sin material. */}
      <input
        className="material-select-required"
        tabIndex={-1}
        required
        value={value}
        onChange={() => undefined}
        aria-hidden
      />
      {abierto && (
        <ul className="material-select-list" role="listbox">
          {filtrados.length === 0 ? (
            <li className="material-select-empty">Sin resultados</li>
          ) : (
            filtrados.map((m, i) => (
              <li
                key={m.id}
                role="option"
                aria-selected={String(m.id) === value}
                className={i === resaltado ? "activo" : undefined}
                onMouseEnter={() => setResaltado(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(m);
                }}
              >
                {etiqueta(m)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
