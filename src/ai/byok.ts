/**
 * The user's own AI accounts. Keys live only in this browser and travel with each AI request; SWDR's
 * server uses them for that request and keeps nothing. OpenRouter connects by sign-in (OAuth PKCE).
 */
export const KEY_PROVIDERS = [
  { id: 'anthropic', label: 'Claude (Anthropic)', hint: 'sk-ant-…', where: 'console.anthropic.com → API keys' },
  { id: 'openai', label: 'OpenAI (GPT)', hint: 'sk-…', where: 'platform.openai.com → API keys' },
  { id: 'gemini', label: 'Google Gemini', hint: 'AIza…', where: 'aistudio.google.com → Get API key (free tier)' },
  { id: 'groq', label: 'Groq', hint: 'gsk_…', where: 'console.groq.com → API keys (free tier)' },
  { id: 'mistral', label: 'Mistral', hint: '…', where: 'console.mistral.ai → API keys' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'sk-or-…', where: 'or use Connect OpenRouter' }
] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number]['id'];
export type Keys = Partial<Record<KeyProvider, string>>;

const STORE = 'swdr-ai-keys';
const VERIFIER = 'swdr-openrouter-verifier';
const RETURN = 'swdr-openrouter-return';

export function loadKeys(): Keys {
  try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Keys; } catch { return {}; }
}

export function saveKeys(keys: Keys) {
  try { localStorage.setItem(STORE, JSON.stringify(keys)); } catch { /* private window: keys last for this visit only */ }
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Sends the user to OpenRouter to approve SWDR; they come back with a code that becomes a key. */
export async function startOpenRouter() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(VERIFIER, verifier);
  sessionStorage.setItem(RETURN, location.hash);
  location.assign(`https://openrouter.ai/auth?callback_url=${encodeURIComponent(`${location.origin}/`)}&code_challenge=${challenge}&code_challenge_method=S256`);
}

/** On load: finishes an OpenRouter sign-in if this page is its callback. */
export async function finishOpenRouter(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const verifier = sessionStorage.getItem(VERIFIER);
  if (!code || !verifier) return false;
  sessionStorage.removeItem(VERIFIER);
  const back = sessionStorage.getItem(RETURN) || '#home';
  sessionStorage.removeItem(RETURN);
  history.replaceState(history.state, '', `/${back}`);
  try {
    const response = await fetch('/api/team', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'openrouter-key', code, verifier }) });
    const body = await response.json() as { data?: { key: string } };
    if (!body.data?.key) return false;
    saveKeys({ ...loadKeys(), openrouter: body.data.key });
    return true;
  } catch {
    return false;
  }
}
