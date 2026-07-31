# Infraestructura AWS

Definida como código en `infra/` (AWS CDK v2, TypeScript). Una sola app
parametrizada por ambiente (`dev` / `prod`), misma cuenta de AWS, región
`us-east-1`. Todo recurso sigue la convención de nombres
`deco-eventos-{ambiente}-*`.

## Arquitectura (Fase 1)

```
Cliente HTTP
   │
   ▼
API Gateway HTTP API (deco-eventos-{ambiente}-api-gateway)
   │
   ▼
Lambda "deco-eventos-{ambiente}-api" (Node 20, ARM64, Hono vía hono/aws-lambda)
   │  (dentro de la VPC, subred aislada, sin acceso a internet)
   ▼
RDS Postgres "deco-eventos-{ambiente}-db" (db.t4g.micro, Single-AZ)
```

- **VPC sin NAT Gateway ni Internet Gateway**: Lambda solo necesita hablar
  con RDS dentro de la misma VPC, así que alcanza con subredes
  `PRIVATE_ISOLATED`. Esto evita el costo fijo de un NAT Gateway
  (~$32+/mes) que no aporta nada acá.
- **Credenciales de base de datos**: autogeneradas por RDS y guardadas en
  **AWS Secrets Manager** (`deco-eventos-{ambiente}-db-credentials`), nunca
  en el repo. El connection string completo se arma con una referencia
  dinámica de CloudFormation (`{{resolve:secretsmanager:...}}`) y se
  inyecta como variable de entorno `DATABASE_URL` del Lambda en el momento
  del deploy. Esto significa que el Lambda **nunca llama a Secrets Manager
  en runtime**, por lo que tampoco necesita salida a internet ni un VPC
  endpoint (que también tiene costo).
- **Logs**: CloudWatch Logs con retención de 14 días
  (`/aws/lambda/deco-eventos-{ambiente}-api`).
- **Presupuesto**: un `AWS Budget` mensual por ambiente con alertas por
  email al 80% y 100% del gasto esperado.

## Por qué Secrets Manager y no SSM Parameter Store

El plan original mencionaba SSM Parameter Store SecureString como opción;
se usó Secrets Manager en su lugar porque `rds.DatabaseInstance` lo
integra de forma nativa (genera y guarda la contraseña automáticamente, sin
código extra), y el requisito explícito del negocio permite cualquiera de
las dos ("Secrets Manager o variables de entorno seguras"). Si se prefiere
SSM en su lugar, es un cambio acotado a `infra/lib/deco-eventos-stack.ts`.

## Empaquetado del Lambda

El handler (`packages/api/src/lambda.ts`) se empaqueta con `esbuild` local
(no requiere Docker). `pdfkit` (usado para exportar cotizaciones a PDF)
trae archivos de datos de fuentes (`.afm`) que esbuild no sabe empaquetar
dentro de un bundle; por eso se instala como dependencia real del paquete
Lambda (`bundling.nodeModules: ["pdfkit"]`) en vez de compilarse inline,
preservando esos archivos. Verificado con `cdk synth`: el bundle final
incluye `node_modules/pdfkit` completo con sus 14 archivos `.afm`.

## Costo mensual estimado (por ambiente)

| Recurso | Estimado |
|---|---|
| RDS db.t4g.micro Single-AZ + 20GB gp3 + backups 7 días | ~$14-15 |
| Lambda (bajo volumen, dentro del free tier) | ~$0 |
| API Gateway HTTP API (bajo volumen) | ~$0-1 |
| CloudWatch Logs | ~$0-1 |
| Secrets Manager (1 secreto) | ~$0.40 |
| VPC (sin NAT/IGW) | $0 |
| **Total por ambiente** | **~$15-17/mes** |

Con `dev` y `prod` desplegados simultáneamente: **~$30-34/mes** en total.
El bucket S3 y el repo ECR que crea `cdk bootstrap` (una sola vez,
compartido entre ambientes) agregan centavos.

## Modelo de permisos IAM

Dos capas, ver el mensaje donde se compartió la política exacta:

1. **Usuario IAM `deco-eventos-deployer`** (credenciales que usa quien
   despliega): solo puede gestionar el stack `CDKToolkit` y stacks que
   empiecen con `deco-eventos-*`, y asumir los roles que crea
   `cdk bootstrap` (`cdk-hnb659fds-*-role-*`). No tiene permisos directos
   sobre EC2, RDS, Lambda, etc.
2. **Roles de CloudFormation** (creados por `cdk bootstrap`, solo
   asumibles por CloudFormation): estos sí tienen permisos amplios,
   porque son los que efectivamente crean VPC/RDS/Lambda/API Gateway
   durante el deploy. Es el modelo estándar de CDK.

## Proceso de deploy

1. `cdk bootstrap` (una sola vez por cuenta/región).
2. `cdk diff deco-eventos-dev` — revisar cambios.
3. `cdk deploy deco-eventos-dev` — solo con confirmación explícita.
4. Para `prod`: siempre `cdk diff deco-eventos-prod` primero, mostrado al
   usuario, y confirmación explícita antes de `cdk deploy
   deco-eventos-prod`. Nunca automático.

## Pendiente (no implementado todavía)

- **Migraciones de base de datos contra RDS**: como RDS no es accesible
  públicamente y no hay NAT/bastion, todavía no hay un mecanismo para
  correr `drizzle-kit migrate` contra el RDS real. Opciones a evaluar
  juntos: (a) un Custom Resource de CDK que corra las migraciones en cada
  deploy usando un Lambda dentro de la misma VPC, o (b) un túnel puntual
  vía SSM Session Manager desde la máquina local. Se decide antes del
  primer deploy a `dev`.
- Fase 2/3/4: álbum de fotos (S3+CloudFront), Google Calendar, SES,
  WhatsApp — no cubiertos por este stack todavía.
