import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Asserts the writing view shows an exact script passage, whether the editor renders lines as
 * form fields or as editable text, and reports whether the passage is read-only.
 */
export async function expectPassage(page: Page, text: string, { readOnly }: { readOnly?: boolean } = {}): Promise<void> {
  const editor = page.getByRole('region', { name: 'Manuscript editor' });
  await expect(editor).toBeVisible();
  const probe = () => editor.evaluate((root, passage) => {
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    const fields = [...root.querySelectorAll('textarea, input')] as (HTMLTextAreaElement | HTMLInputElement)[];
    const field = fields.find(element => element.value.trim() === passage && visible(element));
    if (field) return { found: true, readOnly: field.readOnly || field.disabled };
    const blocks = [...root.querySelectorAll('*')].filter(element =>
      element.children.length === 0 && element.textContent?.trim() === passage && visible(element));
    const block = blocks[0] as HTMLElement | undefined;
    if (!block) return { found: false, readOnly: false };
    return { found: true, readOnly: !block.isContentEditable };
  }, text);
  await expect.poll(async () => (await probe()).found, { message: `passage “${text}” is visible` }).toBe(true);
  if (readOnly !== undefined) expect((await probe()).readOnly).toBe(readOnly);
}
