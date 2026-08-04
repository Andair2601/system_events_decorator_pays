interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  onCambiar: (pagina: number) => void;
}

export default function Paginacion({ pagina, totalPaginas, onCambiar }: PaginacionProps) {
  if (totalPaginas <= 1) return null;

  return (
    <div className="actions-row" style={{ alignItems: "center", margin: "0.75rem 0" }}>
      <button
        type="button"
        className="secondary"
        disabled={pagina <= 1}
        onClick={() => onCambiar(pagina - 1)}
      >
        Anterior
      </button>
      <span className="muted">
        Página {pagina} de {totalPaginas}
      </span>
      <button
        type="button"
        className="secondary"
        disabled={pagina >= totalPaginas}
        onClick={() => onCambiar(pagina + 1)}
      >
        Siguiente
      </button>
    </div>
  );
}
