/**
 * The AI writing partner. Whichever model runs it works from the project's own story bible, outline,
 * characters and pages, sent with each request. Claude runs through the Anthropic SDK; every other
 * provider (OpenRouter, Groq, Gemini, Mistral, OpenAI, or a self-hosted fine-tuned model) through the
 * OpenAI-compatible chat endpoint they all offer. Providers switch on when their key is set.
 * Signed-in accounts only, with a daily request limit.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import { TeamFault } from './team-model.js';

export const AI_MODES = ['brainstorm', 'plot', 'continue', 'dialogue', 'notes', 'logline', 'creator', 'ask'] as const;
export type AiMode = (typeof AI_MODES)[number];

const MAX_CONTEXT = 60_000;
const MAX_PROMPT = 4_000;
const MAX_TURNS = 8;

const RULES = `You are the writing partner inside SWDR, a screenwriting and production workspace. You collaborate with professional writers on film, television, stage, documentary and creator video.

How you work:
- The writer owns the work. Offer options and reasons; never lecture, and never refuse to engage with dark or adult themes that serve the story.
- Ground everything in the project context you are given: its characters, outline, tone and the writer's own pages. Do not contradict established facts; if something is unknown, say what you are assuming.
- Match the writer's voice, vocabulary and spelling conventions (British or American) from their pages.
- Be specific. Name characters, scenes and beats. Avoid generic advice.
- Keep answers tight. No preamble, no closing summary, no markdown headings.`;

const MODE_INSTRUCTIONS: Record<AiMode, string> = {
  brainstorm: 'Brainstorm. Give 6 distinct, surprising options as a numbered list, each one or two sentences, ranging from safe to bold. Mark the one you would pick with ★ and say why in one line at the end.',
  plot: 'Story structure. Diagnose the structure from the outline and pages: where the stakes, turns and midpoint sit, what is missing or sagging. Then propose concrete beats to fix it as a numbered list, each starting with the act (I, II or III).',
  continue: 'Continue the scene from where the current scene ends, for about half a page. Write only screenplay text in Fountain format: scene headings in capitals starting INT. or EXT., action lines, character cues in capitals on their own line, parentheticals in brackets, dialogue under the cue, blank lines between elements. No commentary.',
  dialogue: 'Rewrite the selected dialogue (or the dialogue in the current scene) so each character sounds more distinct and the subtext does more work. Keep the same beats and length or shorter. Write only Fountain screenplay text: character cue in capitals, optional parenthetical, dialogue. No commentary.',
  notes: 'Script notes, as a development executive would give them on the current scene: what works (two lines), then the three most important problems, each with a specific fix. Finish with one line on how the scene serves the whole story.',
  logline: 'Write 5 loglines for this project, each under 40 words, each with a clear protagonist, goal, obstacle and stakes, in different tones. Number them.',
  creator: 'Short-form and YouTube help for this video: 5 scroll-stopping hooks (first 3 seconds), 5 titles under 60 characters, and a tightened version of the script beats. Use plain numbered lists under the labels Hooks, Titles and Beats.',
  ask: 'Answer the writer\'s question directly, using the project context.'
};

/** API keys a user brings from their own provider accounts. Sent with each request, never stored. */
export type UserKeys = Partial<Record<'anthropic' | 'openrouter' | 'groq' | 'gemini' | 'mistral' | 'openai', string>>;

export interface AiRequest {
  /** provider:model, such as anthropic:claude-opus-5-5 or groq:llama-3.3-70b-versatile; mine-<provider> for the user's own key. */
  model?: string;
  keys: UserKeys;
  mode: AiMode;
  prompt: string;
  context: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export function readAiRequest(body: Record<string, unknown>): AiRequest {
  const mode = body.mode as AiMode;
  if (!AI_MODES.includes(mode)) throw new TeamFault(400, 'Choose what you want help with.');
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const context = typeof body.context === 'string' ? body.context : '';
  if (prompt.length > MAX_PROMPT) throw new TeamFault(400, 'That request is too long.');
  if (context.length > MAX_CONTEXT) throw new TeamFault(400, 'The project context is too long.');
  if (mode === 'ask' && !prompt) throw new TeamFault(400, 'Type a question for the AI partner.');
  const history = Array.isArray(body.history) ? body.history.slice(-MAX_TURNS).map(turn => {
    const item = turn as { role?: unknown; content?: unknown };
    if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string' || item.content.length > 20_000) {
      throw new TeamFault(400, 'The conversation could not be read.');
    }
    return { role: item.role as 'user' | 'assistant', content: item.content };
  }) : [];
  const model = typeof body.model === 'string' && /^[a-z-]+:[\w./:@-]{1,160}$/.test(body.model) ? body.model : undefined;
  return { model, keys: readKeys(body.keys), mode, prompt, context, history };
}

export function readKeys(value: unknown): UserKeys {
  if (!value || typeof value !== 'object') return {};
  const keys: UserKeys = {};
  for (const preset of PRESETS) {
    const key = (value as Record<string, unknown>)[preset.id];
    if (key === undefined || key === '') continue;
    if (typeof key !== 'string' || key.length < 10 || key.length > 400 || !/^[\x21-\x7e]+$/.test(key)) throw new TeamFault(400, `That ${preset.label} key does not look right.`);
    keys[preset.id as keyof UserKeys] = key;
  }
  return keys;
}

/** Counts this request against the account's daily allowance (SWDR_AI_DAILY_LIMIT, default 60). */
export async function chargeAi(pool: Pool, email: string, limit = Number(process.env.SWDR_AI_DAILY_LIMIT) || 60): Promise<number> {
  const result = await pool.query<{ requests: number }>(
    `INSERT INTO swdr_ai_usage (email, day, requests) VALUES ($1, current_date, 1)
     ON CONFLICT (email, day) DO UPDATE SET requests = swdr_ai_usage.requests + 1 RETURNING requests`, [email]
  );
  const used = result.rows[0].requests;
  if (used > limit) throw new TeamFault(429, `You have used today's ${limit} AI requests. They reset at midnight UTC.`);
  return limit - used;
}

export function aiMessages(request: AiRequest): { system: Anthropic.Beta.BetaTextBlockParam[]; messages: Anthropic.Beta.BetaMessageParam[] } {
  const ask = [MODE_INSTRUCTIONS[request.mode], request.prompt && `Writer's note: ${request.prompt}`].filter(Boolean).join('\n\n');
  return {
    system: [
      { type: 'text', text: RULES },
      // The project context changes rarely within a session, so it is cached across requests.
      { type: 'text', text: `<project_context>\n${request.context || 'No project context was provided.'}\n</project_context>`, cache_control: { type: 'ephemeral' } }
    ],
    messages: [...request.history, { role: 'user', content: ask }]
  };
}

interface Provider {
  id: string;
  label: string;
  /** OpenAI-compatible base URL; absent for Anthropic. */
  baseUrl?: string;
  key?: string;
  /** Comma-separated allowlist from the environment; when empty, the provider's own /models list is used. */
  models: string[];
}

const PRESETS: Array<{ id: keyof UserKeys; label: string; keyVar: string; baseUrl?: string }> = [
  { id: 'anthropic', label: 'Claude', keyVar: 'ANTHROPIC_API_KEY' },
  { id: 'openrouter', label: 'OpenRouter', keyVar: 'OPENROUTER_API_KEY', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'groq', label: 'Groq', keyVar: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'gemini', label: 'Google Gemini', keyVar: 'GEMINI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'mistral', label: 'Mistral', keyVar: 'MISTRAL_API_KEY', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'openai', label: 'OpenAI', keyVar: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1' }
];

const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

/** Accepts variable names in any capitalisation (Gemini_API_Key works like GEMINI_API_KEY). */
function upperEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const out = { ...env };
  for (const [key, value] of Object.entries(env)) if (out[key.toUpperCase()] === undefined) out[key.toUpperCase()] = value;
  return out;
}

/** Providers whose key (or, for a custom server, base URL) is set. */
export function aiProviders(input: Record<string, string | undefined> = process.env): Provider[] {
  const env = upperEnv(input);
  const list = (value?: string) => (value ?? '').split(',').map(item => item.trim()).filter(Boolean);
  const base = (preset: (typeof PRESETS)[number]) => env[`SWDR_AI_${preset.id.toUpperCase()}_BASE_URL`]?.trim() || preset.baseUrl;
  const providers: Provider[] = PRESETS.filter(preset => env[preset.keyVar]?.trim()).map(preset => ({
    id: preset.id, label: preset.label, baseUrl: base(preset), key: env[preset.keyVar]!.trim(),
    models: list(env[`SWDR_AI_${preset.id.toUpperCase()}_MODELS`]).length ? list(env[`SWDR_AI_${preset.id.toUpperCase()}_MODELS`]) : preset.id === 'anthropic' ? CLAUDE_MODELS : []
  }));
  // Your own model: a fine-tuned open model on Ollama, Hugging Face, Together, Fireworks or any OpenAI-compatible server.
  if (env.SWDR_AI_CUSTOM_BASE_URL?.trim()) {
    providers.push({ id: 'custom', label: env.SWDR_AI_CUSTOM_LABEL?.trim() || 'Your model', baseUrl: env.SWDR_AI_CUSTOM_BASE_URL.trim().replace(/\/+$/, ''),
      key: env.SWDR_AI_CUSTOM_API_KEY?.trim(), models: list(env.SWDR_AI_CUSTOM_MODELS) });
  }
  return providers;
}

/** The user's own accounts, ahead of the server's. Model IDs take a mine- prefix so the two never mix. */
export function userProviders(keys: UserKeys, env: Record<string, string | undefined> = process.env): Provider[] {
  return PRESETS.filter(preset => keys[preset.id]).map(preset => ({
    id: `mine-${preset.id}`, label: `${preset.label} (your account)`,
    baseUrl: env[`SWDR_AI_${preset.id.toUpperCase()}_BASE_URL`]?.trim() || preset.baseUrl, key: keys[preset.id],
    models: preset.id === 'anthropic' ? CLAUDE_MODELS : []
  }));
}

export interface AiModel { id: string; label: string; provider: string; free: boolean }

const modelCache = new Map<string, { at: number; models: AiModel[] }>();

/** Every model the connected providers offer, asked from each provider and cached for ten minutes. */
export async function aiModels(env: Record<string, string | undefined> = process.env, keys: UserKeys = {}): Promise<{ models: AiModel[]; defaultModel?: string }> {
  const out: AiModel[] = [];
  for (const provider of [...userProviders(keys, env), ...aiProviders(env)]) {
    if (provider.models.length || !provider.baseUrl) {
      out.push(...provider.models.map(model => ({ id: `${provider.id}:${model}`, label: model, provider: provider.label, free: /:free$/.test(model) })));
      continue;
    }
    const cacheKey = `${provider.id}:${provider.baseUrl}:${provider.key?.slice(-6) ?? ''}`;
    const cached = modelCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 600_000) { out.push(...cached.models); continue; }
    try {
      const response = await fetch(`${provider.baseUrl}/models`, { headers: provider.key ? { Authorization: `Bearer ${provider.key}` } : {}, signal: AbortSignal.timeout(6000) });
      const body = await response.json() as { data?: Array<{ id: string; name?: string; pricing?: { prompt?: string; completion?: string } }> };
      // Writing needs chat models; leave out embedding, speech, image and moderation models.
      const models = (body.data ?? []).filter(item => !/embed|tts|whisper|transcri|audio|speech|image|imagen|dall-e|moderation|guard|rerank|veo|aqa/i.test(item.id)).slice(0, 400).map(item => ({
        id: `${provider.id}:${item.id.replace(/^models\//, '')}`, label: item.name || item.id.replace(/^models\//, ''), provider: provider.label,
        free: /:free$/.test(item.id) || (item.pricing?.prompt === '0' && item.pricing?.completion === '0')
      }));
      modelCache.set(cacheKey, { at: Date.now(), models });
      out.push(...models);
    } catch {
      // A provider that cannot list its models is left out rather than breaking the picker.
    }
  }
  const preferred = env.SWDR_AI_DEFAULT_MODEL?.trim();
  const own = out.find(model => model.id.startsWith('mine-'));
  return { models: out, defaultModel: own?.id ?? out.find(model => model.id === preferred)?.id ?? out.find(model => model.id === 'anthropic:claude-opus-5-5')?.id ?? out[0]?.id };
}

/** Streams the answer as plain text through `write`. Throws TeamFault before the first byte on setup errors. */
export async function streamAi(request: AiRequest, write: (text: string) => void, signal?: AbortSignal, env: Record<string, string | undefined> = process.env): Promise<void> {
  const providers = [...userProviders(request.keys, env), ...aiProviders(env)];
  if (!providers.length) throw new TeamFault(503, 'No AI model is connected yet. Add your own key, or ask the workspace owner to connect a provider.');
  const chosen = request.model ?? env.SWDR_AI_DEFAULT_MODEL?.trim() ?? (providers[0].id === 'anthropic' ? 'anthropic:claude-opus-5-5' : `${providers[0].id}:${providers[0].models[0] ?? ''}`);
  const split = chosen.indexOf(':');
  const provider = providers.find(item => item.id === chosen.slice(0, split));
  const model = chosen.slice(split + 1);
  if (!provider || !model) throw new TeamFault(400, 'That AI model is not available on this server.');
  if (provider.id === 'anthropic' || provider.id === 'mine-anthropic') return streamClaude(request, model, provider.key!, write, signal);
  return streamCompatible(request, provider, model, write, signal);
}

async function streamClaude(request: AiRequest, model: string, apiKey: string, write: (text: string) => void, signal?: AbortSignal): Promise<void> {
  const client = new Anthropic({ apiKey });
  const { system, messages } = aiMessages(request);
  const fallbackCapable = model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5';
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 8000,
    // Deeper thinking where judgement matters; quicker for drafting and lists.
    output_config: { effort: request.mode === 'plot' || request.mode === 'notes' ? 'high' : 'medium' },
    ...(fallbackCapable ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    system,
    messages
  }, { signal });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') write(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') write('\n\nThe AI partner declined this request. Try rephrasing it.');
  if (final.stop_reason === 'max_tokens') write('\n\n(Stopped at the length limit — ask it to continue.)');
}

/** Any OpenAI-compatible chat endpoint, read as server-sent events. */
async function streamCompatible(request: AiRequest, provider: Provider, model: string, write: (text: string) => void, signal?: AbortSignal): Promise<void> {
  const { system, messages } = aiMessages(request);
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(provider.key ? { Authorization: `Bearer ${provider.key}` } : {}), 'X-Title': 'SWDR' },
    body: JSON.stringify({
      model, stream: true, max_tokens: 4000,
      messages: [{ role: 'system', content: system.map(block => block.text).join('\n\n') }, ...messages.map(item => ({ role: item.role, content: String(item.content) }))]
    }),
    signal
  });
  if (!response.ok || !response.body) {
    const status = response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 503 : 502;
    throw new TeamFault(status, status === 429 ? `${provider.label} is rate-limiting requests. Try again shortly or pick another model.` : `${provider.label} could not run ${model}.`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, '').trim();
      if (!line.startsWith('data:') || !data || data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) write(text);
      } catch { /* keep-alive or partial line */ }
    }
  }
}

/** Exchanges an OpenRouter sign-in code (PKCE) for a key tied to the user's own OpenRouter account. */
export async function openRouterKey(body: Record<string, unknown>, env: Record<string, string | undefined> = process.env): Promise<{ key: string }> {
  const code = typeof body.code === 'string' && /^[\w-]{8,200}$/.test(body.code) ? body.code : undefined;
  const verifier = typeof body.verifier === 'string' && /^[\w-]{43,128}$/.test(body.verifier) ? body.verifier : undefined;
  if (!code || !verifier) throw new TeamFault(400, 'The OpenRouter sign-in could not be completed.');
  const base = env.SWDR_AI_OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
  const response = await fetch(`${base}/auth/keys`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }), signal: AbortSignal.timeout(10_000)
  });
  const result = await response.json().catch(() => ({})) as { key?: string };
  if (!response.ok || typeof result.key !== 'string') throw new TeamFault(502, 'OpenRouter did not approve the connection. Try again.');
  return { key: result.key };
}
