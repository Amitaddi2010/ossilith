/**
 * Ossilith API client — typed fetch wrappers for all backend endpoints.
 */

const API_BASE =
  typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');


// ── Types ─────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  services: Record<string, { status: string; detail?: string }>;
}

export interface Case {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CaseListResponse {
  cases: Case[];
  total: number;
}

export interface CreateCaseRequest {
  name: string;
  description?: string;
}

// ── Fetch helper ──────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Health ────────────────────────────────────────────────

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health');
}

// ── Cases ─────────────────────────────────────────────────

export async function listCases(): Promise<CaseListResponse> {
  return apiFetch<CaseListResponse>('/api/cases');
}

export async function getCase(id: string): Promise<Case> {
  return apiFetch<Case>(`/api/cases/${id}`);
}

export async function createCase(data: CreateCaseRequest): Promise<Case> {
  return apiFetch<Case>('/api/cases', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteCase(id: string): Promise<void> {
  return apiFetch<void>(`/api/cases/${id}`, { method: 'DELETE' });
}

// ── SSE helper for job streaming ──────────────────────────

export function subscribeToJob(
  jobId: string,
  onMessage: (data: { progress: number; message: string; status: string }) => void,
  onError?: (err: Event) => void
): EventSource {
  const es = new EventSource(`${API_BASE}/api/jobs/${jobId}/stream`);
  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
    if (data.status === 'completed' || data.status === 'failed') {
      es.close();
    }
  };
  es.onerror = (err) => {
    onError?.(err);
    es.close();
  };
  return es;
}
