import { describe, expect, it } from "vitest";
import { calcularCotizacion } from "./calcular.js";

describe("calcularCotizacion", () => {
  it("calcula el desglose completo con un solo material", () => {
    const resultado = calcularCotizacion({
      items: [{ materialId: 1, cantidad: 2, costoUnitario: 10 }],
      horasManoObraEstimadas: 3,
      tarifaManoObraHora: 15,
      costoTransporte: 20,
      margenPct: 30,
    });

    expect(resultado.items).toEqual([
      { materialId: 1, cantidad: "2.00", costoUnitarioSnapshot: "10.00", subtotal: "20.00" },
    ]);
    expect(resultado.costoMaterialesTotal).toBe("20.00");
    expect(resultado.costoManoObra).toBe("45.00");
    expect(resultado.costoTransporte).toBe("20.00");
    // margen 30% solo sobre materiales (20) = 6; servicio = 20 + 6 + 45 = 71;
    // final = servicio (71) + transporte (20) = 91
    expect(resultado.margenMonto).toBe("6.00");
    expect(resultado.costoServicioDecoracion).toBe("71.00");
    expect(resultado.precioFinal).toBe("91.00");
  });

  it("suma correctamente varios materiales", () => {
    const resultado = calcularCotizacion({
      items: [
        { materialId: 1, cantidad: 50, costoUnitario: 0.8 },
        { materialId: 2, cantidad: 3, costoUnitario: 45 },
        { materialId: 3, cantidad: 1.5, costoUnitario: 100 },
      ],
      horasManoObraEstimadas: 0,
      tarifaManoObraHora: 20,
      costoTransporte: 0,
      margenPct: 0,
    });

    // 50*0.8 + 3*45 + 1.5*100 = 40 + 135 + 150 = 325
    expect(resultado.costoMaterialesTotal).toBe("325.00");
    expect(resultado.costoManoObra).toBe("0.00");
    expect(resultado.precioFinal).toBe("325.00");
  });

  it("usa 0 por defecto para horas y transporte cuando se omiten", () => {
    const resultado = calcularCotizacion({
      items: [{ materialId: 1, cantidad: 1, costoUnitario: 100 }],
      tarifaManoObraHora: 25,
      margenPct: 20,
    });

    expect(resultado.costoManoObra).toBe("0.00");
    expect(resultado.costoTransporte).toBe("0.00");
    expect(resultado.costoServicioDecoracion).toBe("120.00");
    expect(resultado.precioFinal).toBe("120.00");
  });

  it("no pierde precisión con decimales que en punto flotante binario redondean mal", () => {
    // 0.1 + 0.2 en floats de JS da 0.30000000000000004
    const resultado = calcularCotizacion({
      items: [
        { materialId: 1, cantidad: 1, costoUnitario: 0.1 },
        { materialId: 2, cantidad: 1, costoUnitario: 0.2 },
      ],
      tarifaManoObraHora: 0,
      margenPct: 0,
    });

    expect(resultado.costoMaterialesTotal).toBe("0.30");
  });

  it("acepta strings numéricos (como vienen de columnas NUMERIC de Postgres)", () => {
    const resultado = calcularCotizacion({
      items: [{ materialId: 1, cantidad: "2.50", costoUnitario: "12.00" }],
      horasManoObraEstimadas: "1.5",
      tarifaManoObraHora: "20.00",
      costoTransporte: "10.00",
      margenPct: "25.00",
    });

    // materiales = 30, margen 25% sobre materiales = 7.5, mano de obra = 30
    // -> servicio = 67.5, + transporte 10 = 77.5
    expect(resultado.costoMaterialesTotal).toBe("30.00");
    expect(resultado.costoManoObra).toBe("30.00");
    expect(resultado.costoServicioDecoracion).toBe("67.50");
    expect(resultado.precioFinal).toBe("77.50");
  });

  it("rechaza una cotización sin materiales", () => {
    expect(() =>
      calcularCotizacion({
        items: [],
        tarifaManoObraHora: 20,
        margenPct: 20,
      }),
    ).toThrow();
  });

  it("rechaza una cantidad no positiva", () => {
    expect(() =>
      calcularCotizacion({
        items: [{ materialId: 1, cantidad: -5, costoUnitario: 10 }],
        tarifaManoObraHora: 20,
        margenPct: 20,
      }),
    ).toThrow(/mayor a 0/);
  });

  it("rechaza un costo unitario negativo", () => {
    expect(() =>
      calcularCotizacion({
        items: [{ materialId: 1, cantidad: 5, costoUnitario: -10 }],
        tarifaManoObraHora: 20,
        margenPct: 20,
      }),
    ).toThrow(/no puede ser negativo/);
  });

  it("resta el descuento del total ya calculado", () => {
    const resultado = calcularCotizacion({
      items: [{ materialId: 1, cantidad: 2, costoUnitario: 10 }],
      horasManoObraEstimadas: 3,
      tarifaManoObraHora: 15,
      costoTransporte: 20,
      margenPct: 30,
      descuentoMonto: 10,
    });

    // total antes de descuento = 91.00 (igual que el primer test); -10 de descuento
    expect(resultado.descuentoMonto).toBe("10.00");
    expect(resultado.precioFinal).toBe("81.00");
  });

  it("sin descuento, precioFinal no cambia (default 0)", () => {
    const resultado = calcularCotizacion({
      items: [{ materialId: 1, cantidad: 1, costoUnitario: 100 }],
      tarifaManoObraHora: 0,
      margenPct: 0,
    });
    expect(resultado.descuentoMonto).toBe("0.00");
    expect(resultado.precioFinal).toBe("100.00");
  });

  it("rechaza un descuento negativo", () => {
    expect(() =>
      calcularCotizacion({
        items: [{ materialId: 1, cantidad: 1, costoUnitario: 100 }],
        tarifaManoObraHora: 0,
        margenPct: 0,
        descuentoMonto: -5,
      }),
    ).toThrow(/no puede ser negativo/);
  });

  it("rechaza un descuento mayor al total de la cotización", () => {
    expect(() =>
      calcularCotizacion({
        items: [{ materialId: 1, cantidad: 1, costoUnitario: 100 }],
        tarifaManoObraHora: 0,
        margenPct: 0,
        descuentoMonto: 150,
      }),
    ).toThrow(/no puede ser mayor al total/);
  });
});
