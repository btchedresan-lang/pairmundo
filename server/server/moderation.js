// Checks profile photos before they go live, using Claude (Anthropic API). It stays off until ANTHROPIC_API_KEY is set;
// then each upload gets one of three verdicts: allow, review (goes live, and admins get a report to look at), or reject.
// MODERATION_MODEL picks the model (default claude-opus-5-5).
// If the check itself fails (network, rate limit), the photo is allowed and the error is logged, so uploads never break.

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['allow', 'review', 'reject'] },
    category: { type: 'string', enum: ['none', 'nudity', 'sexual', 'child_safety', 'violence', 'weapons', 'drugs', 'hate', 'contact_details', 'child_in_photo', 'not_a_person', 'other'] },
    note: { type: 'string' },
  },
  required: ['verdict', 'category', 'note'],
  additionalProperties: false,
};

const SYSTEM = `You check profile photos for PairMundo, an app where au pairs and host families find each other. Its terms don't allow photos of children, so any photo where a child can be seen is refused.

Return one verdict:
- "reject" for: nudity or visible genitals, breasts or buttocks; sexual or sexually suggestive content; any child shown nude, partly dressed in a sexualised way, or in a sexualised pose; graphic violence, gore or self-harm; hate symbols; drugs being used; weapons being pointed or brandished; any photo where a child (under 18) can be seen, even in the background (category "child_in_photo").
- "review" when you are unsure about any of the above; for underwear or very revealing clothing, for weapons shown without a threat (for example hunting), and for photos whose main content is text, a phone number, an email address, a social media handle or an advert.
- "allow" for everything else, including swimwear at a beach or pool, pets, homes, landscapes and group photos of adults. A photo that doesn't show a person at all is still "allow" unless it falls under a rule above; use category "not_a_person" for it.

Set category to the main reason ("none" when allowed for no special reason). Keep note to one short sentence for the moderators, and never describe a child's body. If you can't tell whether someone is under 18, use "review".`;

/** Returns async (buffer, mimeType) => { verdict, category, note }, or null when the check is off. */
export function createModerator({ client } = {}) {
  if (!client && !process.env.ANTHROPIC_API_KEY) return null;
  const model = process.env.MODERATION_MODEL || 'claude-opus-5-5';
  let getClient = client ? async () => client : null;
  if (!client) {
    let c;
    getClient = async () => {
      if (!c) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); c = new Anthropic(); }
      return c;
    };
  }
  return async (buf, mediaType) => {
    try {
      const anthropic = await getClient();
      const response = await anthropic.beta.messages.create({
        model,
        max_tokens: 1024,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } },
            { type: 'text', text: 'Check this profile photo.' },
          ],
        }],
      });
      // A declined request means a person should look at it.
      if (response.stop_reason === 'refusal') return { verdict: 'review', category: 'other', note: 'The automatic check declined to assess this photo.' };
      const text = response.content.find((b) => b.type === 'text')?.text;
      const out = JSON.parse(text);
      if (!['allow', 'review', 'reject'].includes(out.verdict)) throw new Error(`unexpected verdict ${out.verdict}`);
      return out;
    } catch (e) {
      console.error('Photo check failed, photo allowed:', e.message);
      return { verdict: 'allow', category: 'none', note: 'check failed', failed: true };
    }
  };
}
