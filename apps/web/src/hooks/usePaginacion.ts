import { useMemo, useState } from "react";

const POR_PAGINA = 20;

export function usePaginacion<T>(items: T[]) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(items.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);

  const itemsPagina = useMemo(
    () => items.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA),
    [items, paginaSegura],
  );

  return { pagina: paginaSegura, totalPaginas, itemsPagina, setPagina };
}
