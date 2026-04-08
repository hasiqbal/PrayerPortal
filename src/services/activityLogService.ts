/**
 * Activity Log Service
 * Tracks all meaningful portal actions: content changes, CSV imports,
 * push notifications sent, user management, and auth events.
 */

import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityAction =
  // Auth
  | 'login' | 'logout'
  // Adhkar
  | 'adhkar_created' | 'adhkar_updated' | 'adhkar_deleted'
  // Adhkar groups
  | 'adhkar_group_created' | 'adhkar_group_updated' | 'adhkar_group_deleted'
  // Prayer times
  | 'prayer_time_updated' | 'prayer_times_csv_imported'
  // Announcements
  | 'announcement_created' | 'announcement_updated' | 'announcement_deleted'
  // Sunnah reminders
  | 'sunnah_created' | 'sunnah_updated' | 'sunnah_deleted'
  | 'sunnah_group_created' | 'sunnah_group_updated' | 'sunnah_group_deleted'
  // Push notifications
  | 'push_notification_sent' | 'push_notification_scheduled' | 'push_notification_cancelled'
  // User management
  | 'user_created' | 'user_updated' | 'user_deleted' | 'user_activated' | 'user_deactivated';

export type EntityType =
  | 'adhkar' | 'adhkar_group'
  | 'prayer_times'
  | 'announcement'
  | 'sunnah_reminder' | 'sunnah_group'
  | 'push_notification'
  | 'portal_user'
  | 'auth';

export interface ActivityLogEntry {
  id: string;
  username: string;
  user_role: string;
  action: ActivityAction;
  entity_type: EntityType;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface LogOptions {
  entityId?: string;
  entityLabel?: string;
  details?: Record<string, unknown>;
}

// ─── Singleton logger — call log() from anywhere ──────────────────────────────

class ActivityLogger {
  private username = 'unknown';
  private userRole = 'viewer';

  /** Call once after login to attach user context */
  setUser(username: string, role: string) {
    this.username = username;
    this.userRole = role;
  }

  clearUser() {
    this.username = 'unknown';
    this.userRole = 'viewer';
  }

  /** Fire-and-forget log — never throws, never blocks UI */
  async log(
    action: ActivityAction,
    entityType: EntityType,
    opts: LogOptions = {}
  ): Promise<void> {
    const entry = {
      username: this.username,
      user_role: this.userRole,
      action,
      entity_type: entityType,
      entity_id: opts.entityId ?? null,
      entity_label: opts.entityLabel ?? null,
      details: opts.details ?? null,
    };

    const { error } = await supabase.from('activity_log').insert(entry);
    if (error) {
      // Non-fatal — just warn in console so logs never break the UI
      console.warn('[ActivityLog] Failed to write log entry:', error.message, entry);
    } else {
      console.log(`[ActivityLog] ${action} by ${this.username}`, opts.entityLabel ?? '');
    }
  }

  /** Fetch recent log entries (most recent first) */
  async fetchRecent(limit = 100): Promise<ActivityLogEntry[]> {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[ActivityLog] Failed to fetch:', error.message);
      return [];
    }
    return (data ?? []) as ActivityLogEntry[];
  }

  /** Fetch by entity type */
  async fetchByEntity(entityType: EntityType, limit = 50): Promise<ActivityLogEntry[]> {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('entity_type', entityType)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as ActivityLogEntry[];
  }

  /** Fetch by username */
  async fetchByUser(username: string, limit = 50): Promise<ActivityLogEntry[]> {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('username', username)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as ActivityLogEntry[];
  }
}

export const activityLogger = new ActivityLogger();
