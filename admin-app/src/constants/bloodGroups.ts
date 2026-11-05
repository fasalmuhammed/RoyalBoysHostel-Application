/**
 * Every blood group offered on the inmate forms: the eight main groups first,
 * then the A1/A2 subgroups and the rare Bombay group that Indian blood banks
 * record. Kept in step with BLOOD_GROUPS in functions/join.js and the
 * drop-down in hosting/join.html.
 */
export const BLOOD_GROUPS = [
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-",
  "A1+", "A1-", "A2+", "A2-", "A1B+", "A1B-", "A2B+", "A2B-",
  "Bombay (Oh)",
] as const;
