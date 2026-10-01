// Shared data shapes. Everything in SiteData and TaskData is encrypted
// on the device before it is sent to Supabase.

export type CredentialKind =
  | 'wp-admin'
  | 'hosting'
  | 'cpanel'
  | 'domain'
  | 'gsc'
  | 'analytics'
  | 'bing'
  | 'ftp'
  | 'database'
  | 'email'
  | 'api'
  | 'other';

export const CREDENTIAL_KINDS: { value: CredentialKind; label: string }[] = [
  { value: 'wp-admin', label: 'WordPress admin' },
  { value: 'hosting', label: 'Hosting account' },
  { value: 'cpanel', label: 'cPanel / control panel' },
  { value: 'domain', label: 'Domain registrar' },
  { value: 'gsc', label: 'Google Search Console' },
  { value: 'analytics', label: 'Google Analytics' },
  { value: 'bing', label: 'Bing Webmaster Tools' },
  { value: 'ftp', label: 'FTP / SFTP' },
  { value: 'database', label: 'Database' },
  { value: 'email', label: 'Email account' },
  { value: 'api', label: 'API key' },
  { value: 'other', label: 'Other' },
];

export function kindLabel(kind: CredentialKind): string {
  return CREDENTIAL_KINDS.find((k) => k.value === kind)?.label ?? 'Other';
}

export interface Credential {
  id: string;
  kind: CredentialKind;
  label: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

export interface Renewal {
  id: string;
  label: string; // e.g. "Domain", "SSL", "Hosting"
  date: string; // YYYY-MM-DD
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface SiteData {
  name: string;
  url: string;
  tags: string[];
  hostProvider: string;
  registrar: string;
  notes: string;
  credentials: Credential[];
  renewals: Renewal[];
  checklist: ChecklistItem[];
}

export type Role = 'owner' | 'editor' | 'viewer';

export interface Site {
  id: string;
  ownerId: string;
  role: Role;
  key: Uint8Array; // decrypted site key, lives only in memory
  data: SiteData;
  updatedAt: string;
}

export type Priority = 'low' | 'normal' | 'high';

export interface TaskData {
  title: string;
  notes: string;
  done: boolean;
  due: string; // YYYY-MM-DD or ''
  priority: Priority;
  assignee: string; // teammate email or ''
}

export interface Task {
  id: string;
  siteId: string;
  data: TaskData;
  createdBy: string | null;
  updatedAt: string;
}

export interface Settings {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  autoLockMinutes: number;
  clipboardClearSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = {
  aiBaseUrl: 'https://api.blackbox.ai',
  aiApiKey: '',
  aiModel: 'blackboxai/openai/gpt-5.5',
  autoLockMinutes: 10,
  clipboardClearSeconds: 30,
};

export interface Member {
  userId: string;
  email: string;
  displayName: string | null;
  role: Role;
  waiting?: boolean; // reset their vault; needs access restored
}

export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for webviews without randomUUID: RFC 4122 v4 from the secure RNG.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptyCredential(kind: CredentialKind = 'wp-admin'): Credential {
  return { id: newId(), kind, label: kindLabel(kind), url: '', username: '', password: '', notes: '' };
}

export function emptyTask(): TaskData {
  return { title: '', notes: '', done: false, due: '', priority: 'normal', assignee: '' };
}

/** Fill in any fields missing from older records so the UI never crashes. */
export function normalizeSite(d: Partial<SiteData>): SiteData {
  return {
    name: d.name ?? 'Untitled site',
    url: d.url ?? '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    hostProvider: d.hostProvider ?? '',
    registrar: d.registrar ?? '',
    notes: d.notes ?? '',
    credentials: (d.credentials ?? []).map((c) => ({ ...emptyCredential(c.kind), ...c })),
    renewals: d.renewals ?? [],
    checklist: d.checklist ?? [],
  };
}

export function normalizeTask(d: Partial<TaskData>): TaskData {
  return { ...emptyTask(), ...d };
}
