export function toNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === 'string') {
    const normalized = input.trim();
    if (normalized === '') {
      return null;
    }

    const stripped = normalized.replace(/,/g, '');
    const parsed = Number(stripped);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return Number.isFinite(input) ? input : null;
}

export function sumNumbers(values: Array<number | null | undefined>): number {
  return values.reduce<number>(
    (acc, value) => (typeof value === 'number' ? acc + value : acc),
    0,
  );
}

