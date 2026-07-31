import { App } from "aws-cdk-lib";
import { DecoEventosStack } from "../lib/deco-eventos-stack.js";

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

// Presupuesto mensual esperado por ambiente (ver docs/infra.md para el
// desglose). Se puede ajustar por contexto: cdk deploy -c presupuestoDev=20
const presupuestoDev = Number(app.node.tryGetContext("presupuestoDev") ?? 20);
const presupuestoProd = Number(app.node.tryGetContext("presupuestoProd") ?? 25);
const emailAlertas = app.node.tryGetContext("emailAlertas") ?? "aldair2601@gmail.com";

new DecoEventosStack(app, "deco-eventos-dev", {
  env,
  ambiente: "dev",
  emailAlertaPresupuesto: emailAlertas,
  presupuestoMensualUsd: presupuestoDev,
  tags: { ambiente: "dev", proyecto: "deco-eventos" },
});

new DecoEventosStack(app, "deco-eventos-prod", {
  env,
  ambiente: "prod",
  emailAlertaPresupuesto: emailAlertas,
  presupuestoMensualUsd: presupuestoProd,
  tags: { ambiente: "prod", proyecto: "deco-eventos" },
});
