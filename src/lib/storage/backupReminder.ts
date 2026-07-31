/**
 * Backup reminder policy (issue #9). Pure decision logic: the UI shows a
 * calm, dismissible hint when meaningful progress exists but no recent
 * export does. Dismissing snoozes it for a full period — never nagging.
 */

/** Days after which an export is considered stale. */
export const EXPORT_STALE_DAYS = 14;
/** Minimum completed sessions before we ever mention backups. */
export const MIN_SESSIONS_FOR_REMINDER = 5;

export interface BackupReminderInput {
  /** ISO timestamp of the last export, or null if never exported. */
  lastExportAt: string | null;
  /** ISO timestamp of the last reminder dismissal, or null. */
  dismissedAt: string | null;
  /** Total completed sessions across profiles on this device. */
  sessionCount: number;
  now: Date;
}

export function shouldRemindBackup(input: BackupReminderInput): boolean {
  if (input.sessionCount < MIN_SESSIONS_FOR_REMINDER) return false;
  if (isWithinDays(input.lastExportAt, EXPORT_STALE_DAYS, input.now)) return false;
  if (isWithinDays(input.dismissedAt, EXPORT_STALE_DAYS, input.now)) return false;
  return true;
}

function isWithinDays(iso: string | null, days: number, now: Date): boolean {
  if (!iso) return false;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return false;
  const ageMs = now.getTime() - then;
  return ageMs >= 0 && ageMs < days * 86_400_000;
}

/** Meta keys used by the reminder + export bookkeeping. */
export const META_LAST_EXPORT_AT = "lastExportAt";
export const META_BACKUP_REMINDER_DISMISSED_AT = "backupReminderDismissedAt";
