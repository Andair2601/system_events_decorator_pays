import PDFDocument from "pdfkit";
import type { CotizacionCompleta } from "./service.js";

const MONEDA = "S/";
const MARGEN = 50;
const COL_X = [MARGEN, MARGEN + 240, MARGEN + 330, MARGEN + 420] as const;
const COL_W = [230, 80, 80, 75] as const;
const TABLA_DERECHA = COL_X[3] + COL_W[3];

function filaTabla(
  doc: PDFKit.PDFDocument,
  y: number,
  celdas: [string, string, string, string],
  opts: { negrita?: boolean; alinearDerechaDesde?: number } = {},
) {
  doc.font(opts.negrita ? "Helvetica-Bold" : "Helvetica").fontSize(10);
  celdas.forEach((texto, i) => {
    const align = i >= (opts.alinearDerechaDesde ?? 1) ? "right" : "left";
    doc.text(texto, COL_X[i]!, y, { width: COL_W[i], align });
  });
}

// Genera el PDF de una cotización para enviar al cliente. Usa las fuentes
// estándar de pdfkit (no requiere archivos de fuente externos), pensado
// para correr también en un handler Lambda más adelante.
export async function generarCotizacionPdf(data: CotizacionCompleta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGEN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text("Decoración de Eventos");
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#555555")
      .text(`Cotización #${data.id} · emitida el ${new Date().toLocaleDateString("es-PE")}`);
    doc.fillColor("#000000").moveDown(1.5);

    doc.font("Helvetica-Bold").fontSize(12).text("Cliente");
    doc.font("Helvetica").fontSize(10);
    doc.text(data.cliente.nombre);
    doc.text(data.cliente.telefono);
    if (data.cliente.email) doc.text(data.cliente.email);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Evento");
    doc.font("Helvetica").fontSize(10);
    doc.text(data.nombreEvento);
    doc.text(`Tipo: ${data.tipoEvento.replace(/_/g, " ")}`);
    doc.moveDown(1.5);

    doc.font("Helvetica-Bold").fontSize(12).text("Materiales");
    doc.moveDown(0.5);

    let y = doc.y;
    filaTabla(doc, y, ["Material", "Cantidad", "Costo unit.", "Subtotal"], { negrita: true });
    y += 16;
    doc
      .moveTo(MARGEN, y)
      .lineTo(TABLA_DERECHA, y)
      .strokeColor("#cccccc")
      .stroke();
    y += 8;

    for (const item of data.items) {
      filaTabla(doc, y, [
        `${item.materialNombre} (${item.materialUnidad})`,
        item.cantidad,
        `${MONEDA} ${item.costoUnitarioSnapshot}`,
        `${MONEDA} ${item.subtotal}`,
      ]);
      y += 18;
    }
    doc.x = MARGEN;
    doc.y = y;
    doc.moveDown(1.5);

    const resumenValorW = 100;
    const resumenValorX = TABLA_DERECHA - resumenValorW;
    const resumenLabelX = MARGEN + 250;
    const resumenLabelW = resumenValorX - resumenLabelX;

    function lineaResumen(etiqueta: string, valor: string, negrita = false) {
      doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(negrita ? 13 : 10);
      const fila = doc.y;
      doc.text(etiqueta, resumenLabelX, fila, { width: resumenLabelW });
      doc.text(valor, resumenValorX, fila, { width: resumenValorW, align: "right" });
      doc.y = fila + (negrita ? 20 : 16);
    }

    lineaResumen("Materiales", `${MONEDA} ${data.costoMaterialesTotal}`);
    lineaResumen(`Mano de obra (${data.horasManoObraEstimadas} h)`, `${MONEDA} ${data.costoManoObra}`);
    lineaResumen("Transporte", `${MONEDA} ${data.costoTransporte}`);
    lineaResumen(`Margen aplicado`, `${data.margenPctAplicado}%`);
    doc.moveDown(0.5);
    lineaResumen("Total", `${MONEDA} ${data.precioFinal}`, true);

    doc.end();
  });
}
