import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

export type Ambiente = "dev" | "prod";

export interface DecoEventosStackProps extends StackProps {
  ambiente: Ambiente;
  // Email que recibe la alerta de presupuesto. Requerido explícitamente
  // (no hay default) para no mandar notificaciones a una dirección
  // equivocada por descuido.
  emailAlertaPresupuesto: string;
  presupuestoMensualUsd: number;
}

// Todo lo que crea esta stack sigue la convención deco-eventos-{ambiente}-*
// (requisito del negocio: los permisos IAM del usuario que despliega están
// scopeados a ese prefijo).
export class DecoEventosStack extends Stack {
  constructor(scope: Construct, id: string, props: DecoEventosStackProps) {
    super(scope, id, props);

    const { ambiente, emailAlertaPresupuesto, presupuestoMensualUsd } = props;
    const nombre = (sufijo: string) => `deco-eventos-${ambiente}-${sufijo}`;
    // dev es descartable (cdk destroy no debe dejar nada huérfano cobrando);
    // prod conserva snapshot/backup aunque alguien borre la stack por error.
    const esProd = ambiente === "prod";

    // --- Red: sin NAT Gateway ni Internet Gateway a propósito. Lambda solo
    // necesita hablar con RDS dentro de la VPC; no necesita salir a
    // internet, así que subredes aisladas alcanzan y evitan el costo fijo
    // de un NAT Gateway (~$32+/mes).
    const vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: nombre("vpc"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: nombre("aislada"),
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    const lambdaSg = new ec2.SecurityGroup(this, "LambdaSg", {
      securityGroupName: nombre("lambda-sg"),
      vpc,
      allowAllOutbound: false,
      description: "API Lambda de deco-eventos",
    });

    const dbSg = new ec2.SecurityGroup(this, "DbSg", {
      securityGroupName: nombre("db-sg"),
      vpc,
      allowAllOutbound: false,
      description: "RDS Postgres de deco-eventos",
    });

    lambdaSg.connections.allowTo(dbSg, ec2.Port.tcp(5432), "Lambda -> Postgres");

    // --- Base de datos: credenciales autogeneradas en Secrets Manager
    // (nunca hardcodeadas). El connection string se resuelve como
    // referencia dinámica de CloudFormation en tiempo de deploy y se
    // inyecta como variable de entorno de Lambda: así el Lambda nunca
    // necesita llamar a Secrets Manager en runtime, y por lo tanto no
    // necesita salida a internet (evita pagar un VPC endpoint también).
    const dbCredentials = rds.Credentials.fromGeneratedSecret("deco_eventos_admin", {
      secretName: nombre("db-credentials"),
    });

    const db = new rds.DatabaseInstance(this, "Database", {
      instanceIdentifier: nombre("db"),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: dbCredentials,
      databaseName: "deco_eventos",
      allocatedStorage: 20,
      storageEncrypted: true,
      multiAz: false, // Single-AZ: decisión de costo explícita, ver docs/infra.md
      backupRetention: Duration.days(7),
      deleteAutomatedBackups: !esProd,
      deletionProtection: esProd,
      removalPolicy: esProd ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      publiclyAccessible: false,
    });

    const databaseUrl =
      `postgres://${db.secret!.secretValueFromJson("username").unsafeUnwrap()}` +
      `:${db.secret!.secretValueFromJson("password").unsafeUnwrap()}` +
      `@${db.instanceEndpoint.hostname}:${db.instanceEndpoint.port}/deco_eventos`;

    // --- Lambda con la API (Hono) detrás de API Gateway HTTP API.
    const logGroup = new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: `/aws/lambda/${nombre("api")}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: esProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const apiFn = new NodejsFunction(this, "ApiFunction", {
      functionName: nombre("api"),
      entry: path.join(REPO_ROOT, "packages/api/src/lambda.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64, // mismo tipo de CPU que db.t4g, y más barato que x86_64
      memorySize: 256,
      timeout: Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSg],
      logGroup,
      depsLockFilePath: path.join(REPO_ROOT, "pnpm-lock.yaml"),
      environment: {
        DATABASE_URL: databaseUrl,
        DB_POOL_MAX: "2",
      },
      bundling: {
        // pdfkit trae archivos de fuentes (.afm) que esbuild no sabe
        // empaquetar; instalarlo como dependencia real (no bundlearlo)
        // preserva esos archivos junto al código.
        nodeModules: ["pdfkit"],
        minify: true,
        target: "node20",
      },
    });

    // --- API Gateway HTTP API. El CORS ya lo maneja Hono (app.ts) para
    // que el comportamiento sea idéntico al servidor local; no se
    // duplica configuración de CORS acá.
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: nombre("api-gateway"),
      defaultIntegration: new apigwv2Integrations.HttpLambdaIntegration(
        "DefaultIntegration",
        apiFn,
      ),
    });

    // --- Presupuesto: alerta por email al superar el 80% y el 100% del
    // gasto mensual esperado para este ambiente.
    new budgets.CfnBudget(this, "Budget", {
      budget: {
        budgetName: nombre("budget"),
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: presupuestoMensualUsd, unit: "USD" },
      },
      notificationsWithSubscribers: [80, 100].map((umbral) => ({
        notification: {
          notificationType: "ACTUAL",
          comparisonOperator: "GREATER_THAN",
          threshold: umbral,
          thresholdType: "PERCENTAGE",
        },
        subscribers: [{ subscriptionType: "EMAIL", address: emailAlertaPresupuesto }],
      })),
    });

    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "DbSecretName", { value: db.secret!.secretName });
  }
}
