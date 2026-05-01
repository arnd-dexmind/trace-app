const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID_RE = /^c[a-z0-9]{24}$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value) || CUID_RE.test(value);
}

export function validateUuid(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ValidationError(fieldName, "must be a valid UUID");
  }
  return value;
}

export function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(fieldName, "is required");
  }
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return undefined;
}

export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(fieldName, `must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export class ValidationError extends Error {
  public readonly field: string;
  public readonly detail: string;

  constructor(field: string, detail: string) {
    super(`${field} ${detail}`);
    this.field = field;
    this.detail = detail;
  }
}
