import { cpSync } from "node:fs";

// Copia la carpeta de migraciones de Drizzle al bundle del Lambda de
// migraciones. Separado en su propio archivo (en vez de "node -e ...")
// para no depender de cómo cada shell (cmd.exe en Windows vs sh en
// Linux/Mac) maneja el anidamiento de comillas al invocar esbuild.
const [, , src, dest] = process.argv;
cpSync(src, dest, { recursive: true });
