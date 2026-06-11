// Spanish calendar dates: weekday + day-of-month (in words) + month.
// e.g. "martes, nueve de junio". The day-of-month is spelled "uno", "dos"…
// (Spain-style cardinal, matching the chosen format — not "primero").
import { numberToSpanish } from "./numbers";

// JS getDay(): 0 = Sunday … 6 = Saturday.
const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Canonical Spanish form, e.g. "martes, nueve de junio".
export function dateToSpanish(date: Date): string {
  const weekday = WEEKDAYS_ES[date.getDay()];
  const day = numberToSpanish(date.getDate());
  const month = MONTHS_ES[date.getMonth()];
  return `${weekday}, ${day} de ${month}`;
}

// English prompt shown in the Calendar game, e.g. "Tuesday, June 9".
export function dateToEnglish(date: Date): string {
  return `${WEEKDAYS_EN[date.getDay()]}, ${MONTHS_EN[date.getMonth()]} ${date.getDate()}`;
}
