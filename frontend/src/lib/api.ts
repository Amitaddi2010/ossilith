/**
 * Ossilith API client — typed fetch wrappers for all backend endpoints.
 */

const API_BASE =
  typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000');


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

// ── Auto-Segmentation (TotalSegmentator) ─────────────────

export interface AutoSegPreset {
  id: string;
  name: string;
  description: string;
  structures_count: number;
  category: string;
  recommended_for: string;
}

export interface AutoSegRequest {
  task?: string;
  fast?: boolean;
  generate_stls?: boolean;
}

export interface AutoSegResponse {
  job_id: string;
  status: string;
  message: string;
  case_id: string;
  series_id: string;
  task: string;
  fast: boolean;
}

export interface AutoSegStatusResponse {
  has_job: boolean;
  job_id?: string;
  status: string;
  progress?: number;
  message?: string;
  error?: string | null;
  result_data?: any;
  created_at?: string | null;
  completed_at?: string | null;
}

export async function getAutoSegTasks(): Promise<AutoSegPreset[]> {
  return apiFetch<AutoSegPreset[]>('/api/cases/autoseg/tasks');
}

export async function startAutoSegmentation(
  caseId: string,
  data: AutoSegRequest = {}
): Promise<AutoSegResponse> {
  return apiFetch<AutoSegResponse>(`/api/cases/${caseId}/autoseg`, {
    method: 'POST',
    body: JSON.stringify({
      task: data.task || 'total',
      fast: data.fast ?? false,
      generate_stls: data.generate_stls ?? false,
    }),
  });
}

export async function getAutoSegStatus(caseId: string): Promise<AutoSegStatusResponse> {
  return apiFetch<AutoSegStatusResponse>(`/api/cases/${caseId}/autoseg/status`);
}

// ── SSE helper for job streaming ──────────────────────────

export function subscribeToJob(
  jobId: string,
  onMessage: (data: { progress: number; message: string; status: string; result_data?: any }) => void,
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

