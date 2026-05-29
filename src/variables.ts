export const DEFAULT_VARIABLES: Record<string, string> = {
  style: "12",
};

const VALID_VALUES: Record<string, Set<string>> = {
  style: new Set(["1", "12"]),
};

export function validateVariable(name: string, value: string): string | null {
  const allowed = VALID_VALUES[name];
  if (!allowed) {
    return null;
  }
  if (allowed.has(value)) {
    return null;
  }

  const choices = Array.from(allowed).sort((a, b) => Number(a) - Number(b)).join(", ");
  return `Bad value '${value}' for variable '${name}'. Valid values: ${choices}\n`;
}
