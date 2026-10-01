import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { isTauri } from './ai';

let clearTimer: ReturnType<typeof setTimeout> | null = null;

async function write(text: string) {
  if (isTauri()) await writeText(text);
  else await navigator.clipboard.writeText(text);
}

/** Copy text; if it's a secret, wipe the clipboard after `clearAfterSeconds`. */
export async function copyText(text: string, clearAfterSeconds?: number): Promise<void> {
  await write(text);
  if (clearTimer) clearTimeout(clearTimer);
  if (clearAfterSeconds && clearAfterSeconds > 0) {
    clearTimer = setTimeout(() => {
      write('').catch(() => undefined);
      clearTimer = null;
    }, clearAfterSeconds * 1000);
  }
}
