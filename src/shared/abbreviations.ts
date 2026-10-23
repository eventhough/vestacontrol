// Abbreviations used to squeeze messages onto the board. They are only applied
// when a message doesn't fit, and in tier order: tier 1 reads naturally, tier 2
// is texting-style shorthand, tier 3 drops filler words entirely.

export interface Abbreviation {
  word: string;
  short: string;
  tier: 1 | 2 | 3;
}

const TIER1: Record<string, string> = {
  MONDAY: "MON", TUESDAY: "TUE", WEDNESDAY: "WED", THURSDAY: "THU", FRIDAY: "FRI",
  SATURDAY: "SAT", SUNDAY: "SUN",
  JANUARY: "JAN", FEBRUARY: "FEB", MARCH: "MAR", APRIL: "APR", AUGUST: "AUG",
  SEPTEMBER: "SEPT", OCTOBER: "OCT", NOVEMBER: "NOV", DECEMBER: "DEC",
  TOMORROW: "TMRW", YESTERDAY: "YDAY", TONIGHT: "TONITE", WEEKEND: "WKND", WEEKENDS: "WKNDS",
  MORNING: "MORN", AFTERNOON: "AFTN", EVENING: "EVE",
  MINUTES: "MINS", MINUTE: "MIN", SECONDS: "SECS", HOURS: "HRS", HOUR: "HR",
  WEEKS: "WKS", WEEK: "WK", MONTHS: "MOS", MONTH: "MO", YEARS: "YRS", YEAR: "YR",
  BIRTHDAY: "BDAY", BIRTHDAYS: "BDAYS", ANNIVERSARY: "ANNIV", CONGRATULATIONS: "CONGRATS",
  CHRISTMAS: "XMAS", APPOINTMENT: "APPT", APPOINTMENTS: "APPTS", DOCTOR: "DR",
  PRACTICE: "PRACT", HOMEWORK: "HW", BREAKFAST: "BFAST", INFORMATION: "INFO",
  TEMPERATURE: "TEMP", FORECAST: "FCST", DEGREES: "°", PERCENT: "%",
  PLEASE: "PLS", THANKS: "THX", BECAUSE: "BC", ABOUT: "ABT", AROUND: "ARND",
  BETWEEN: "BTWN", THROUGH: "THRU", WITHOUT: "W/O", WITH: "W/", PEOPLE: "PPL",
  MESSAGE: "MSG", REMEMBER: "REMEMBR", REMINDER: "REMINDR", IMPORTANT: "IMPT",
  FAVORITE: "FAV", GRANDMA: "GMA", GRANDPA: "GPA", BROTHER: "BRO", SISTER: "SIS",
  STREET: "ST", AVENUE: "AVE", ROAD: "RD", NUMBER: "NO.", OKAY: "OK",
  AND: "&", PLUS: "+", EQUALS: "=", DOLLARS: "$", QUESTION: "Q",
  GOING: "GOIN", NOTHING: "NOTHIN",
  DEFINITELY: "DEF", PROBABLY: "PROB", APPROXIMATELY: "APPROX", TOMORROWS: "TMRWS",
};

const TIER2: Record<string, string> = {
  YOU: "U", YOUR: "UR", "YOU'RE": "UR", ARE: "R", FOR: "4", TO: "2", TOO: "2",
  LATER: "L8R", GREAT: "GR8", TONITE: "2NITE", NIGHT: "NITE", LIGHT: "LITE",
  LOVE: "LUV", AT: "@", BE: "B", SEE: "C", WHY: "Y", OH: "O",
  TODAY: "2DAY", BEFORE: "B4", PICTURE: "PIC",
};

const TIER3 = ["THE", "A", "AN", "THAT", "JUST", "VERY", "REALLY"];

export const ABBREVIATIONS: Abbreviation[] = [
  ...Object.entries(TIER1).map(([word, short]) => ({ word, short, tier: 1 as const })),
  ...Object.entries(TIER2)
    .filter(([word, short]) => word !== short)
    .map(([word, short]) => ({ word, short, tier: 2 as const })),
  ...TIER3.map((word) => ({ word, short: "", tier: 3 as const })),
];

export function abbreviationFor(word: string, maxTier: number): Abbreviation | undefined {
  let best: Abbreviation | undefined;
  for (const a of ABBREVIATIONS) {
    if (a.word === word && a.tier <= maxTier && (!best || a.tier < best.tier)) best = a;
  }
  return best;
}
