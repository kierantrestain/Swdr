/**
 * Training data for fine-tuning an open model on a writer's own scripts. Each example asks the model to
 * write a scene from its heading and the scene before it, and answers with the writer's real scene, so a
 * fine-tuned model learns their voice, format and pacing. One JSON object per line in the chat format
 * that Hugging Face, Unsloth, Axolotl, Together, Fireworks and OpenAI fine-tuning all accept.
 */
import type { Project } from '../model';
import { fountain } from './context';

const SYSTEM = 'You are a screenwriter. Write in Fountain screenplay format, in the voice, rhythm and formatting of this writer.';

export function trainingExamples(projects: Project[]): Array<{ messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> }> {
  const examples: Array<{ messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> }> = [];
  for (const project of projects) {
    for (const document of project.documents) {
      if (document.kind === 'av') continue;
      const starts = document.blocks.map((block, index) => block.kind === 'scene' ? index : -1).filter(index => index >= 0);
      starts.forEach((start, at) => {
        const scene = document.blocks.slice(start, starts[at + 1] ?? document.blocks.length);
        const text = fountain(scene);
        if (text.split(/\s+/).length < 25) return;
        const previous = at > 0 ? fountain(document.blocks.slice(starts[at - 1], start)).slice(-1500) : '';
        const prompt = [`Project: ${project.title}${project.synopsis ? ` — ${project.synopsis}` : ''}`,
          previous && `Previous scene:\n${previous}`, `Write the scene that begins: ${document.blocks[start].text.toUpperCase()}`].filter(Boolean).join('\n\n');
        examples.push({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }, { role: 'assistant', content: text }] });
      });
    }
  }
  return examples;
}

export function trainingJsonl(projects: Project[]): string {
  return trainingExamples(projects).map(example => JSON.stringify(example)).join('\n') + '\n';
}
