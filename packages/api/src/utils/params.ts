export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export function parseIdParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(`Parámetro id inválido: "${raw}"`);
  }
  return id;
}
