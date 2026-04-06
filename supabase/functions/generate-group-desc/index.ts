import { corsHeaders } from '../_shared/cors.ts';

const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');

interface GroupInput {
  name: string;
  prayerTime: string;
  entryCount: number;
}

async function generateDescription(group: GroupInput): Promise<string> {
  const prayerTimeLabel = group.prayerTime.replace(/-/g, ' ');
  const prompt = `You are an Islamic scholar assistant helping a masjid manage their digital adhkar (supplications) portal.

Generate a SHORT, informative description (1–2 sentences, max 180 characters) for an adhkar group called "${group.name}".

Context:
- This group contains ${group.entryCount} adhkar/supplication(s)
- It is categorised under: ${prayerTimeLabel}
- The description will appear in a mobile app under the group title

Guidelines:
- Be factual and concise
- Reference Quran/hadith only if well-known and accurate
- Do NOT fabricate hadith references
- Use simple English suitable for a general Muslim audience
- Do NOT start with "This group" or "A group"
- Do NOT include inverted commas or quotation marks around the whole description

Reply with ONLY the description text, nothing else.`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: 'You are a knowledgeable Islamic scholar assistant. Generate accurate, concise descriptions for Islamic supplications and adhkar groups.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI request failed: ${response.status} — ${text.slice(0, 200)}`);
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) throw new Error('Empty response from AI');
  return content;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!apiKey || !baseUrl) {
      return new Response(JSON.stringify({ error: 'OnSpace AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as { groups: GroupInput[] };
    const { groups } = body;

    if (!Array.isArray(groups) || groups.length === 0) {
      return new Response(JSON.stringify({ error: 'groups array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[generate-group-desc] Generating descriptions for ${groups.length} groups`);

    // Generate descriptions sequentially to avoid rate limits
    const results: { name: string; description: string; error?: string }[] = [];
    for (const group of groups) {
      try {
        const description = await generateDescription(group);
        results.push({ name: group.name, description });
        console.log(`[generate-group-desc] "${group.name}" → "${description.slice(0, 60)}…"`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[generate-group-desc] Failed for "${group.name}":`, msg);
        results.push({ name: group.name, description: '', error: msg });
      }
    }

    const succeeded = results.filter((r) => !r.error).length;
    console.log(`[generate-group-desc] Done: ${succeeded}/${groups.length} succeeded`);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-group-desc] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
