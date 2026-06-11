// Spanish cardinal numbers, 0 – 1,000,000,000.
// Used by the Numbers game, and by Time (minutes) and Calendar (day-of-month).

const ONES = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
  "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const TENS: Record<number, string> = {
  30: "treinta", 40: "cuarenta", 50: "cincuenta", 60: "sesenta",
  70: "setenta", 80: "ochenta", 90: "noventa",
};
const HUNDREDS: Record<number, string> = {
  2: "doscientos", 3: "trescientos", 4: "cuatrocientos", 5: "quinientos",
  6: "seiscientos", 7: "setecientos", 8: "ochocientos", 9: "novecientos",
};

// 0–99. `apocope` turns a trailing "uno" into "un" (before "mil"/"millón"/a noun):
// 1 → un, 21 → veintiún, 31 → treinta y un.
function tensUnits(n: number, apocope: boolean): string {
  if (n < 30) {
    if (apocope && n === 1) return "un";
    if (apocope && n === 21) return "veintiún";
    return ONES[n];
  }
  const t = Math.floor(n / 10) * 10;
  const u = n % 10;
  if (u === 0) return TENS[t];
  const unit = apocope && u === 1 ? "un" : ONES[u];
  return `${TENS[t]} y ${unit}`;
}

// 0–999. Returns "" for 0 (callers join non-empty parts).
function group3(n: number, apocope: boolean): string {
  if (n === 0) return "";
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h === 1) parts.push(r === 0 ? "cien" : "ciento");
  else if (h > 1) parts.push(HUNDREDS[h]);
  if (r > 0) parts.push(tensUnits(r, apocope));
  return parts.join(" ");
}

// 0–999,999.
function upToMillion(n: number, apocope: boolean): string {
  if (n === 0) return "";
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (th === 1) parts.push("mil");
  else if (th > 1) parts.push(`${group3(th, true)} mil`);
  if (rest > 0) parts.push(group3(rest, apocope));
  return parts.join(" ");
}

export function numberToSpanish(n: number): string {
  if (!Number.isFinite(n)) return "";
  n = Math.trunc(n);
  if (n === 0) return "cero";
  if (n < 0) return `menos ${numberToSpanish(-n)}`;

  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const parts: string[] = [];
  if (millions === 1) parts.push("un millón");
  else if (millions > 1) parts.push(`${upToMillion(millions, true)} millones`);
  if (rest > 0) parts.push(upToMillion(rest, false));
  return parts.join(" ");
}
