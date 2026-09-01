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
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
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

    // --- Base de datos: Postgres administrado por Supabase (no RDS). El
    // connection string vive en un secreto de Secrets Manager creado a mano
    // fuera de CDK (ver docs/infra.md) — no se usa SSM Parameter Store
    // porque CloudFormation no soporta referencias {{resolve:ssm-secure:...}}
    // en variables de entorno de Lambda (confirmado en un intento real de
    // deploy: "SSM Secure reference is not supported in:
    // AWS::Lambda::Function/.../DATABASE_URL").
    const dbUrlSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "DbUrlSecret",
      nombre("database-url"),
    );
    const databaseUrl = dbUrlSecret.secretValue.unsafeUnwrap();

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
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64, // más barato que x86_64
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup,
      depsLockFilePath: path.join(REPO_ROOT, "pnpm-lock.yaml"),
      environment: {
        DATABASE_URL: databaseUrl,
        DB_POOL_MAX: "2",
        DB_SSL: "require",
        // Supavisor (pooler de Supabase) puede no preservar prepared
        // statements entre reconexiones; explícito acá porque esta Lambda
        // corre bajo invocaciones concurrentes reales.
        DB_PREPARE: "false",
      },
      bundling: {
        // pdfkit trae archivos de fuentes (.afm) que esbuild no sabe
        // empaquetar; instalarlo como dependencia real (no bundlearlo)
        // preserva esos archivos junto al código.
        nodeModules: ["pdfkit"],
        minify: true,
        target: "node22", // esbuild aun no reconoce "node24"; node22 es compatible
      },
    });

    // --- Lambda de migraciones: NO se invoca automáticamente en cada
    // deploy (decisión explícita, ver docs/infra.md). Se corre a mano con
    // `aws lambda invoke` cuando hay cambios de esquema pendientes.
    const migrateLogGroup = new logs.LogGroup(this, "MigrateLogGroup", {
      logGroupName: `/aws/lambda/${nombre("migrate")}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: esProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    new NodejsFunction(this, "MigrateFunction", {
      functionName: nombre("migrate"),
      entry: path.join(REPO_ROOT, "packages/core/src/db/migrate-lambda.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: Duration.seconds(60),
      logGroup: migrateLogGroup,
      depsLockFilePath: path.join(REPO_ROOT, "pnpm-lock.yaml"),
      environment: { DATABASE_URL: databaseUrl, DB_SSL: "require" },
      bundling: {
        minify: true,
        target: "node22",
        // Las migraciones de Drizzle son archivos .sql/.json, no código:
        // esbuild no los toca, así que se copian al paquete a mano con un
        // script propio (no "node -e ...") para no depender de cómo cada
        // shell (cmd.exe en Windows vs sh en Linux/Mac) anida comillas.
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => {
            const src = path.join(inputDir, "packages/core/src/db/migrations");
            const dest = path.join(outputDir, "migrations");
            const script = path.join(__dirname, "copy-migrations.mjs");
            return [`node "${script}" "${src}" "${dest}"`];
          },
        },
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

    // --- Panel web: sitio estático (build de apps/web) en S3, servido
    // por CloudFront. El bucket es privado (bloqueado a acceso público
    // directo); CloudFront accede vía Origin Access Control, no un
    // bucket policy público.
    //
    // El build de Vite necesita saber la URL de la API EN TIEMPO DE
    // BUILD (queda inline en el JS, no es una env var de runtime), así
    // que el flujo es: 1) desplegar/actualizar esta stack para tener la
    // URL de la API, 2) correr `pnpm --filter @deco-eventos/web build`
    // con VITE_API_URL apuntando a esa URL, 3) `cdk deploy` de nuevo
    // para subir el build nuevo a S3 (BucketDeployment invalida el
    // caché de CloudFront automáticamente). Documentado en docs/infra.md.
    const panelBucket = new s3.Bucket(this, "PanelBucket", {
      bucketName: `${nombre("panel")}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: esProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !esProd,
    });

    // --- Fotos genéricas: álbum (Fase 2) y foto de material comparten este
    // bucket/behavior, cada uno con sus propios registros en su tabla —
    // acá solo se almacena el archivo. Bucket privado, servido públicamente
    // vía la misma distribución de CloudFront del panel (behavior aparte,
    // no una distribución nueva). El Lambda de la API solo firma URLs de
    // subida (operación local, sin llamada HTTP a S3); el navegador sube
    // el archivo directo a S3. Por eso alcanza con un grant de IAM.
    const fotosBucket = new s3.Bucket(this, "FotosBucket", {
      bucketName: `${nombre("fotos")}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: esProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !esProd,
      // El navegador sube el archivo directo a S3 con la URL prefirmada, así
      // que S3 necesita permitir el preflight CORS del origen del panel. El
      // origen real (dominio de CloudFront, o localhost en dev local) no se
      // conoce en build-time del bucket ni vale la pena restringirlo acá: la
      // seguridad la da la firma/expiración de la URL prefirmada, no el CORS.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    const panelDistribution = new cloudfront.Distribution(this, "PanelDistribution", {
      comment: nombre("panel"),
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(panelBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // Fotos (álbum y materiales) en el mismo dominio, bajo /fotos/*. El prefijo
      // "fotos/" vive dentro de la propia key de S3 (ver packages/api/src/s3.ts,
      // buildFotoKey) para que el path que reenvía CloudFront calce con el
      // objeto real en el bucket.
      additionalBehaviors: {
        "/fotos/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(fotosBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      // React Router usa rutas del lado del cliente (/cotizaciones, etc.)
      // que no existen como objetos en S3; sin esto, refrescar en esas
      // rutas daría 403/404 en vez de cargar la app.
      // Nota: esto aplica a toda la distribución, incluido /fotos/* — una
      // foto realmente inexistente también se reescribe a index.html (200)
      // en vez de un 404 real. Se ve como imagen rota en el <img> igual,
      // así que se deja así por ahora (ver docs/infra.md).
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // solo edges NA/EU: el más barato
    });

    fotosBucket.grantPut(apiFn);
    apiFn.addEnvironment("FOTOS_BUCKET", fotosBucket.bucketName);
    // Sin "/fotos" acá: buildFotoKey() ya genera keys con ese prefijo
    // (ver packages/api/src/s3.ts), así que la URL pública es
    // "<dominio>/" + key (que ya arranca con "fotos/").
    apiFn.addEnvironment(
      "FOTOS_BASE_URL",
      `https://${panelDistribution.distributionDomainName}`,
    );

    new s3deploy.BucketDeployment(this, "PanelDeployment", {
      sources: [s3deploy.Source.asset(path.join(REPO_ROOT, "apps/web/dist"))],
      destinationBucket: panelBucket,
      distribution: panelDistribution,
      distributionPaths: ["/*"],
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
    new CfnOutput(this, "PanelUrl", { value: `https://${panelDistribution.distributionDomainName}` });
  }
}
