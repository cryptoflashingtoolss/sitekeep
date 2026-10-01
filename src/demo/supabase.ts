// Demo stand-in for lib/supabase.ts: pretends a project is connected.
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}
export function getConfig(): SupabaseConfig | null {
  return { url: 'https://demo.supabase.co', anonKey: 'demo' };
}
export function saveConfig(_c: SupabaseConfig): void {}
export function clearConfig(): void {}
export function sb(): never {
  throw new Error('No database in demo mode');
}
