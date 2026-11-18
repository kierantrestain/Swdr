# AI partner

The AI partner helps with ideas, structure, drafting, dialogue, notes, loglines and creator hooks. Open it from **AI partner** in the Script, AV script and Outline toolbars, the team workspace, or **AI hooks & titles** in Creator studio.

## Simplest setup (free)

1. Get a free Gemini key at [aistudio.google.com](https://aistudio.google.com) → **Get API key** (no card needed), or a free OpenRouter key at [openrouter.ai](https://openrouter.ai) → **Keys**.
2. In Vercel → Settings → Environment Variables, add `GEMINI_API_KEY` (or `OPENROUTER_API_KEY`) and redeploy.

That's all. Signed-in users click **AI partner** and it works; they never see a key. When only one model is connected there is no model picker.

Free tiers are rate-limited, and on Google's free tier prompts may be used to improve Google's products. For private scripts, use a paid tier (Gemini or OpenRouter credits) or Claude (`ANTHROPIC_API_KEY`).

## Users' own accounts (optional)

Under **Your AI accounts** in the AI partner, a user can connect their own provider account so their requests are billed to them: **Connect OpenRouter** signs in to OpenRouter and returns a key for their account, or they paste an Anthropic, OpenAI, Gemini, Groq or Mistral API key. Keys stay in that browser and are sent only with their AI requests; the server uses them for that request and stores nothing. Once connected, their account's models come first.

Consumer subscriptions (Claude Pro or Max, ChatGPT Plus or Pro) cannot be used inside other apps; neither company offers that. The route that does use a subscription is the other way round: an SWDR connector (an MCP server) added to Claude or ChatGPT, so people work on their SWDR projects from inside those apps.

## How it works

Every request carries the project's own context, built in the browser: title, synopsis, logline, genre and comparable titles, characters ranked by dialogue, locations, the outline by act, the scene where the cursor is, any selected text, and a sample of the writer's pages so the model matches their voice. The server adds the house rules for the chosen mode and streams the answer back. Drafts from **Continue** and **Dialogue** can be inserted into the script at the cursor and undone like any edit.

The AI partner needs a signed-in account (keys stay on the server and use is counted) and a connected provider. Each account gets `SWDR_AI_DAILY_LIMIT` requests a day (default 60).

## Connect models

Set any of these in the hosting environment (Vercel → Settings → Environment Variables) and redeploy. Each provider that has a key appears in the model picker with the models it offers; free models are marked.

| Provider | Key | Notes |
| --- | --- | --- |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | Opus 5.5, Sonnet 5.5, Haiku 5.5. Claude Opus 5.5 is the default when present; refused requests fall back automatically. |
| OpenRouter | `OPENROUTER_API_KEY` | One key for hundreds of models from many labs, including free ones. |
| Groq | `GROQ_API_KEY` | Very fast open models. |
| Google Gemini | `GEMINI_API_KEY` | Gemini through its OpenAI-compatible endpoint. |
| Mistral | `MISTRAL_API_KEY` | |
| OpenAI | `OPENAI_API_KEY` | |
| Your own model | `SWDR_AI_CUSTOM_BASE_URL` (+ `SWDR_AI_CUSTOM_API_KEY`, `SWDR_AI_CUSTOM_LABEL`) | Any OpenAI-compatible server: Ollama, vLLM, LM Studio, Hugging Face, Together, Fireworks. Use this for a fine-tuned model. |

Optional: `SWDR_AI_<PROVIDER>_MODELS` (comma-separated) limits a provider to the models you name instead of its full list, for example `SWDR_AI_OPENROUTER_MODELS`. `SWDR_AI_DEFAULT_MODEL` picks the default, written `provider:model` (for example `groq:llama-3.3-70b-versatile`).

### Free options

Free tiers change, so check each provider's pricing page, but at the time of writing:

- **OpenRouter** lists free models (their IDs end in `:free`); SWDR marks them **free** in the picker. They are rate-limited.
- **Groq** and **Google AI Studio (Gemini)** offer free API tiers with rate limits.
- **Ollama** is free software that runs open models (Llama, Qwen, Mistral, Gemma) on your own machine or server. The hosted app reaches it through `SWDR_AI_CUSTOM_BASE_URL`, so it must be on a public HTTPS address (a small server, or a tunnel), not only on a laptop.

## Fine-tune a model on your writing

Large hosted models are not usually fine-tuned; SWDR instead gives them your project as context on every request, which keeps them current as the script changes. For a model that has your voice built in, fine-tune an open model:

1. **Export training data.** In the AI partner, choose **Export training data**. Each example asks for a scene from its heading and the scene before it, and answers with your real scene, in the chat JSONL format that Unsloth, Axolotl, Hugging Face, Together, Fireworks and OpenAI fine-tuning accept. More finished scenes make a better model; a few hundred is a good start.
2. **Train.** The cheapest route is a LoRA fine-tune of a small open model (for example Llama or Qwen in the 7–8B range) with Unsloth's free Google Colab notebooks, or Hugging Face AutoTrain.
3. **Serve.** Load the result in Ollama or vLLM on a server, or upload it to Hugging Face, Together or Fireworks.
4. **Connect.** Set `SWDR_AI_CUSTOM_BASE_URL` to its OpenAI-compatible address (for Ollama, `https://your-server/v1`), plus `SWDR_AI_CUSTOM_API_KEY` if it needs one and `SWDR_AI_CUSTOM_LABEL` for its name in the picker, and redeploy.

Training data contains your scripts. Only upload it to services you trust with them.
