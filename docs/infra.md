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
Lambda "deco-eventos-{ambiente}-api" (Node 24, ARM64, Hono vía hono/aws-lambda)
   │  (dentro de la VPC, subred aislada, sin acceso a internet, SSL)
   ▼
RDS Postgres "deco-eventos-{ambiente}-db" (db.t4g.micro, Single-AZ)
```

Además, un tercer Lambda `deco-eventos-{ambiente}-migrate` (misma VPC/SG,
sin exponerse vía API Gateway) para aplicar migraciones — ver sección
"Migraciones" más abajo.

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
- **SSL obligatorio con RDS**: la instancia exige conexiones cifradas
  (`no pg_hba.conf entry ... no encryption` si no se usa). Los Lambdas se
  conectan con `DB_SSL=require` (ver `packages/core/src/db/client.ts`);
  el Postgres local de `docker-compose` no lo requiere, así que esa
  variable solo se setea en la stack de CDK, nunca en `.env` local.

## Migraciones

`deco-eventos-{ambiente}-migrate` es un Lambda separado (mismo acceso a
la VPC/RDS que la API, sin ruta pública) que corre
`drizzle-orm/postgres-js/migrator` contra las migraciones de
`packages/core/src/db/migrations`. **No se invoca automáticamente en cada
deploy** — decisión explícita: la alternativa (Custom Resource de CDK que
corra la migración dentro del propio deploy) es más cómoda pero más
frágil, porque una migración fallida puede trabar o hacer rollback de
todo el stack, no solo del cambio de esquema.

Se corre a mano después de un deploy con cambios de esquema:

```
aws lambda invoke --profile deco-eventos --function-name deco-eventos-{ambiente}-migrate --region us-east-1 out.json
cat out.json   # {"ok":true} si salió bien
```

Las migraciones (`.sql` + carpeta `meta/`) no son código JS, así que
esbuild no las empaqueta solo: `infra/lib/deco-eventos-stack.ts` las
copia al bundle con un `commandHook` que invoca
`infra/lib/copy-migrations.mjs` (un script propio, no `cp` ni `node -e`
inline, para no depender de cómo cada shell —cmd.exe en Windows vs sh en
Linux/Mac— maneja el anidamiento de comillas).

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
preservando esos archivos. Verificado con `cdk synth` (bundle incluye
`node_modules/pdfkit` con sus 14 `.afm`) y contra el Lambda ya desplegado
en AWS (`GET /cotizaciones/:id/pdf` devolvió un PDF válido de verdad).

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

Dos capas:

1. **Usuario IAM `deco-eventos-deployer`** (credenciales que usa quien
   despliega): gestiona el stack `CDKToolkit` y stacks que empiecen con
   `deco-eventos-*`, y asume los roles que crea `cdk bootstrap`
   (`cdk-hnb659fds-*-role-*`). No tiene permisos directos sobre EC2, RDS,
   etc. — esos los ejerce el rol de CloudFormation, no el usuario.
   Además de la política inicial, se agregaron dos statements de solo
   lectura/invocación necesarios para operar después del deploy (no para
   desplegar en sí):
   - `lambda:InvokeFunction` en `arn:...:function:deco-eventos-*` — para
     poder correr el Lambda de migraciones a mano.
   - `logs:GetLogEvents`, `logs:FilterLogEvents`,
     `logs:DescribeLogStreams`, `logs:DescribeLogGroups` en
     `arn:...:log-group:/aws/lambda/deco-eventos-*:*` — para poder
     diagnosticar errores de los Lambdas sin depender solo de lo que
     devuelve `aws lambda invoke`.
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

## Problemas reales encontrados en el primer deploy (y su fix)

Quedan documentados porque son errores concretos que costó diagnosticar,
no hipotéticos — útil si algo similar vuelve a pasar en `prod`:

1. **Descripción de security group con `>`**: `lambdaSg.connections
   .allowTo(dbSg, ec2.Port.tcp(5432), "Lambda -> Postgres")` — EC2
   rechaza `>` en descripciones de reglas (`InvalidRequest`). Fix: sin
   caracteres especiales en la descripción.
2. **Versión de Postgres retirada**: `PostgresEngineVersion.VER_16_4`
   dejó de estar disponible en RDS (`Cannot find version 16.4`). Fix: se
   usa `VER_16` (sin minor fijo) para que RDS tome el default vigente de
   la rama 16 y no se rompa de nuevo cuando retiren otro minor.
3. **Comillas anidadas en Windows**: el `commandHook` de bundling corre
   vía `cmd.exe /c ...`, y `node -e "...JSON.stringify..."` con comillas
   dobles anidadas rompía el parseo de `cmd.exe` (no de Node). Fix: un
   script propio (`copy-migrations.mjs`) invocado con rutas como
   argumentos, sin código inline entre comillas.
4. **RDS exige SSL**: el error real (`no pg_hba.conf entry for host ...,
   no encryption`) solo apareció al capturar explícitamente
   `err.cause.message` del `PostgresError` — por defecto esa propiedad no
   es enumerable y `Object.entries(err)` no la mostraba, así que el error
   se veía como un genérico `28000` sin explicación. Fix funcional:
   `DB_SSL=require` en los Lambdas. Fix de diagnóstico: capturar
   propiedades del error por nombre explícito, no con `Object.entries`.

## Pendiente

- Deploy a `prod`: siempre con `cdk diff deco-eventos-prod` mostrado y
  confirmación explícita antes de `cdk deploy deco-eventos-prod`.
- Fase 2/3/4: álbum de fotos (S3+CloudFront), Google Calendar, SES,
  WhatsApp — no cubiertos por este stack todavía.
