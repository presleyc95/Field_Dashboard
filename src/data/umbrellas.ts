/**
 * OPCO umbrellas: parent labels for search and filtering only. Production is never added
 * together by umbrella (ARCHITECTURE.md §5). Matching ignores capitalization and spacing.
 * An OPCO that isn't listed has no umbrella and shows under its own name.
 */
export const UMBRELLAS: Record<string, string[]> = {
  AEP: [
    "AEP TX",
    "AEP OHIO",
    "AEP SRP",
    "AEP Resiliency (SRP)",
    "AEP REJECT",
    "AEP TEXAS REJECT POLE",
    "AEP TX SMALL WIRE",
    "APCO",
    "PSO",
    "SWEPCO",
    "SWEPCO REJECT POLE",
    "SWEPCO SMALL WIRE",
  ],
  Entergy: ["ENTERGY", "ENTERGY POLE INSPECTION"],
  Oncor: ["ONCOR", "ONCOR ENGINEERING"],
};

const BY_OPCO = new Map<string, string>(
  Object.entries(UMBRELLAS).flatMap(([umbrella, opcos]) =>
    opcos.map((opco) => [opcoKey(opco), umbrella] as const),
  ),
);

export function opcoKey(opco: string): string {
  return opco.replace(/\s+/g, " ").trim().toUpperCase();
}

export function umbrellaFor(opco: string): string | null {
  return BY_OPCO.get(opcoKey(opco)) ?? null;
}
