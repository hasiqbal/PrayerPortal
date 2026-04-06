import { corsHeaders } from '../_shared/cors.ts';

const EXT_BASE = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';
const EXT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';

const WRITE_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': EXT_KEY,
  'Prefer': 'return=representation',
};

/**
 * PATCH all adhkar entries in a group to set a new description.
 * The app reads the group description from individual adhkar entries,
 * not from adhkar_groups (which is empty on the external backend).
 */
async function cascadeDescriptionToEntries(
  groupName: string,
  description: string | null,
): Promise<number> {
  const url = `${EXT_BASE}/adhkar?group_name=eq.${encodeURIComponent(groupName)}`;
  console.log(`[sync-group] Cascading description to all entries in "${groupName}"`);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: WRITE_HEADERS,
    body: JSON.stringify({ description }),
  });

  const body = await res.text();
  console.log(`[sync-group] Description cascade response: ${res.status} — ${body.slice(0, 300)}`);

  if (!res.ok) {
    throw new Error(`Description cascade failed: ${res.status} — ${body}`);
  }

  let rows: unknown[] = [];
  try { rows = JSON.parse(body); } catch { /* ignore */ }
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Cascade-rename: update group_name (and optionally prayer_time + description) on all
 * adhkar entries that currently belong to oldGroupName.
 */
async function cascadeAdhkarEntries(
  oldGroupName: string,
  newGroupName: string,
  newPrayerTime?: string,
  newDescription?: string | null,
): Promise<number> {
  const patch: Record<string, unknown> = { group_name: newGroupName };
  if (newPrayerTime) patch.prayer_time = newPrayerTime;
  if (newDescription !== undefined) patch.description = newDescription;

  const url = `${EXT_BASE}/adhkar?group_name=eq.${encodeURIComponent(oldGroupName)}`;
  console.log(`[sync-group] Cascading adhkar entries: "${oldGroupName}" → "${newGroupName}"`);

  const res = await fetch(url, { method: 'PATCH', headers: WRITE_HEADERS, body: JSON.stringify(patch) });
  const body = await res.text();
  console.log(`[sync-group] Cascade rename response: ${res.status} — ${body.slice(0, 200)}`);

  if (!res.ok) {
    throw new Error(`Cascade adhkar update failed: ${res.status} — ${body}`);
  }

  let rows: unknown[] = [];
  try { rows = JSON.parse(body); } catch { /* ignore */ }
  return Array.isArray(rows) ? rows.length : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json() as {
      groupName: string;
      payload?: Record<string, unknown>;
      oldGroupName?: string;     // present when renaming
      newPrayerTime?: string;    // present when prayer time changed
      descriptionOnly?: boolean; // true = only cascade description to adhkar entries
    };

    const { groupName, payload = {}, oldGroupName, newPrayerTime, descriptionOnly } = body;

    if (!groupName) {
      return new Response(JSON.stringify({ error: 'groupName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Record<string, unknown> = {};

    // ── 1. Description-only sync: cascade to all adhkar entries ───────────
    // The external adhkar_groups table is empty — the app reads description
    // from individual adhkar entries, so we must cascade it there.
    if (descriptionOnly) {
      const description = payload.description !== undefined ? payload.description as string | null : null;
      try {
        const count = await cascadeDescriptionToEntries(groupName, description);
        results.descriptionCascaded = count;
        console.log(`[sync-group] Cascaded description to ${count} entries in "${groupName}"`);
      } catch (err) {
        results.descriptionError = String(err);
        console.error('[sync-group] Description cascade error (non-fatal):', err);
      }
      return new Response(JSON.stringify({ ok: true, ...results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Cascade rename: update group_name on adhkar entries ────────────
    if (oldGroupName && oldGroupName !== groupName) {
      try {
        // Also carry description if provided
        const descPayload = payload.description !== undefined ? payload.description as string | null : undefined;
        const count = await cascadeAdhkarEntries(oldGroupName, groupName, newPrayerTime, descPayload);
        results.cascadedEntries = count;
        console.log(`[sync-group] Cascaded ${count} adhkar entries: "${oldGroupName}" → "${groupName}"`);
      } catch (cascadeErr) {
        results.cascadeError = String(cascadeErr);
        console.error('[sync-group] Cascade error (non-fatal):', cascadeErr);
      }
    }

    // ── 3. Sync any additional metadata fields to adhkar entries ──────────
    // Since adhkar_groups on external backend is empty, we push metadata
    // (description, prayer_time) down to individual entries.
    const entryPatch: Record<string, unknown> = {};
    if (payload.description !== undefined) entryPatch.description = payload.description;
    if (newPrayerTime && !oldGroupName) entryPatch.prayer_time = newPrayerTime;

    if (Object.keys(entryPatch).length > 0 && !oldGroupName) {
      // No rename — just patch entries in this group with updated fields
      try {
        const count = await cascadeDescriptionToEntries(groupName, entryPatch.description as string | null ?? null);
        results.entriesPatched = count;
      } catch (patchErr) {
        results.entryPatchError = String(patchErr);
        console.error('[sync-group] Entry patch error (non-fatal):', patchErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-group] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
