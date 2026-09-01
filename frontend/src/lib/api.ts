/**
 * Ossilith API client — typed fetch wrappers for all backend endpoints.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? window.location.hostname.includes('trycloudflare.com')
      ? ''
      : `${window.location.protocol}//${window.location.hostname}:8000`
    : 'http://127.0.0.1:8000');



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
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 120000) : null;

  try {
    const res = await fetch(url, {
      signal: options.signal || controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text();
      let errorMsg = `API ${res.status}`;
      try {
        const json = JSON.parse(body);
        errorMsg = json.detail || json.message || errorMsg;
      } catch {
        if (body) errorMsg = `${errorMsg}: ${body}`;
      }
      throw new Error(errorMsg);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    throw err;
  }
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
  engine?: string;
}

export interface AutoSegRequest {
  task?: string;
  model_engine?: 'totalsegmentator' | 'monai';
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
  model_engine?: string;
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
      task: data.task || 'only_bones',
      model_engine: data.model_engine || 'totalsegmentator',
      fast: data.fast ?? false,
      generate_stls: data.generate_stls ?? false,
    }),
  });
}


export async function getAutoSegStatus(caseId: string): Promise<AutoSegStatusResponse> {
  return apiFetch<AutoSegStatusResponse>(`/api/cases/${caseId}/autoseg/status`);
}

// ── Advanced Surgical Segmentation APIs ───────────────────

export interface RegionGrowParams {
  axis: 'axial' | 'coronal' | 'sagittal';
  slice_index: number;
  point: [number, number];
  min_hu?: number;
  max_hu?: number;
  search_radius_mm?: number;
  fill_holes?: boolean;
  positive?: boolean;
}

export interface IslandFilterParams {
  operation: 'keep_largest' | 'remove_small' | 'split' | 'keep_selected';
  min_size_voxels?: number;
  axis?: 'axial' | 'coronal' | 'sagittal';
  slice_index?: number;
  point?: [number, number];
}

export interface ThresholdParams {
  min_hu?: number;
  max_hu?: number;
  fill_holes?: boolean;
  mode?: 'replace' | 'union' | 'intersect' | 'subtract';
}

export interface MorphologyParams {
  operation: 'smooth' | 'fill_holes' | 'dilate' | 'erode';
  radius?: number;
}

export interface SplitMaskParams {
  mode?: 'islands' | 'plane';
  min_size_voxels?: number;
  max_components?: number;
  axis?: 'axial' | 'coronal' | 'sagittal';
  slice_index?: number;
  delete_original?: boolean;
  prefix?: string;
}

export interface SplitMaskCreatedLayer {
  id: string;
  name: string;
  color: string;
  voxel_count: number;
  volume_cm3?: number;
  mask_path: string;
  status: string;
}

export interface SplitMaskResponse {
  status: string;
  mode: string;
  parent_layer_id: string;
  components_count: number;
  created_layers: SplitMaskCreatedLayer[];
}

export async function splitMask(
  caseId: string,
  layerId: string,
  params: SplitMaskParams
): Promise<SplitMaskResponse> {
  return apiFetch(`/api/cases/${caseId}/layers/${layerId}/split-mask`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function executeRegionGrow(
  caseId: string,
  layerId: string,
  params: RegionGrowParams
): Promise<{ status: string; voxel_count: number }> {
  return apiFetch(`/api/cases/${caseId}/layers/${layerId}/region-grow`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function executeIslandFilter(
  caseId: string,
  layerId: string,
  params: IslandFilterParams
): Promise<any> {
  return apiFetch(`/api/cases/${caseId}/layers/${layerId}/island-filter`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function executeThreshold(
  caseId: string,
  layerId: string,
  params: ThresholdParams
): Promise<{ status: string; voxel_count: number }> {
  return apiFetch(`/api/cases/${caseId}/layers/${layerId}/threshold`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function executeMorphology(
  caseId: string,
  layerId: string,
  params: MorphologyParams
): Promise<{ status: string; voxel_count: number }> {
  return apiFetch(`/api/cases/${caseId}/layers/${layerId}/morphology`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── STL Mesh Shells & Multi-Bone Separation ───────────────

export interface MeshShellInfo {
  index: number;
  vertex_count: number;
  face_count: number;
  volume_cm3: number;
  surface_area_cm2: number;
  is_watertight: boolean;
  bounds: [[number, number, number], [number, number, number]];
  centroid: [number, number, number];
  bbox_dims: [number, number, number];
}

export interface SplitPartResult {
  id: string;
  case_id: string;
  name: string;
  filename: string;
  vertex_count: number;
  face_count: number;
  volume_cm3: number;
  surface_area_cm2: number;
  is_watertight: boolean;
  color: string;
  download_url: string;
}

export async function listMeshShells(
  caseId: string,
  stlId: string
): Promise<{ stl_id: string; total_shells: number; shells: MeshShellInfo[] }> {
  return apiFetch(`/api/cases/${caseId}/stls/${stlId}/shells`);
}

export async function removeMeshShells(
  caseId: string,
  stlId: string,
  options: { keep_indices?: number[]; remove_indices?: number[] }
): Promise<{ status: string; remaining_shells: number; vertex_count: number; face_count: number }> {
  return apiFetch(`/api/cases/${caseId}/stls/${stlId}/shells/remove`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function splitMeshShells(
  caseId: string,
  stlId: string,
  options: { min_faces?: number; max_parts?: number; delete_original?: boolean; keep_indices?: number[] } = {}
): Promise<{ status: string; original_stl_id: string; split_count: number; parts: SplitPartResult[] }> {
  return apiFetch(`/api/cases/${caseId}/stls/${stlId}/shells/split`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function purgeDebrisShells(
  caseId: string,
  stlId: string,
  options: { min_volume_ratio?: number; min_faces?: number } = {}
): Promise<{ status: string; purged_count: number; remaining_shells: number; vertex_count: number; face_count: number }> {
  return apiFetch(`/api/cases/${caseId}/stls/${stlId}/shells/purge-debris`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// ── SSE helper for job streaming with polling fallback ──

export function subscribeToJob(
  jobId: string,
  onMessage: (data: { progress: number; message: string; status: string; result_data?: any }) => void,
  onError?: (err: Event) => void
): { close: () => void } {
  let isDone = false;
  const es = new EventSource(`${API_BASE}/api/jobs/${jobId}/stream`);

  const pollInterval = setInterval(async () => {
    if (isDone) return;
    try {
      const job = await apiFetch<{ progress: number; message: string; status: string; result_data?: any }>(
        `/api/jobs/${jobId}`
      );
      if (job && !isDone) {
        onMessage(job);
        if (job.status === 'completed' || job.status === 'failed') {
          isDone = true;
          clearInterval(pollInterval);
          es.close();
        }
      }
    } catch {}
  }, 2000);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
      if (data.status === 'completed' || data.status === 'failed') {
        isDone = true;
        clearInterval(pollInterval);
        es.close();
      }
    } catch {}
  };

  es.onerror = (err) => {
    if (onError) onError(err);
    // Don't close immediately on transient error; polling fallback keeps running
  };

  return {
    close: () => {
      isDone = true;
      clearInterval(pollInterval);
      es.close();
    },
  };
}

// ── License Management ────────────────────────────────────

export interface LicenseStatus {
  is_active: boolean;
  is_valid: boolean;
  status: string;
  tier: string;
  customer: string;
  organization: string;
  hwid: string;
  licensed_hwid?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  days_remaining?: number | null;
  features: string[];
  is_trial: boolean;
}

export async function fetchLicenseStatus(): Promise<LicenseStatus> {
  return apiFetch<LicenseStatus>('/api/license/status');
}

export async function fetchHardwareId(): Promise<{ hwid: string }> {
  return apiFetch<{ hwid: string }>('/api/license/hwid');
}

export async function activateLicense(licenseKey: string): Promise<LicenseStatus> {
  return apiFetch<LicenseStatus>('/api/license/activate', {
    method: 'POST',
    body: JSON.stringify({ license_key: licenseKey }),
  });
}

export async function startEvaluationTrial(customerName?: string): Promise<LicenseStatus> {
  return apiFetch<LicenseStatus>('/api/license/trial', {
    method: 'POST',
    body: JSON.stringify({ customer_name: customerName || 'Clinical Evaluation User' }),
  });
}

// ── Admin License Portal ──────────────────────────────────

export interface AdminLicenseRecord {
  license_id: string;
  customer: string;
  organization: string;
  email: string;
  hwid: string;
  tier: string;
  issued_date: string;
  expiry_date?: string | null;
  days_valid: number;
  features: string[];
  max_cases: number;
  license_key: string;
  is_revoked: boolean;
  notes?: string | null;
  status: string;
}

export interface AdminStats {
  total_issued: number;
  active_count: number;
  revoked_count: number;

  expiring_soon_count: number;
  tier_breakdown: Record<string, number>;
}

export interface GenerateLicensePayload {
  customer: string;
  organization?: string;
  email?: string;
  hwid?: string;
  tier?: string;
  days?: number;
  features?: string[];
  max_cases?: number;
  notes?: string;
}

export async function fetchAdminLicenses(): Promise<AdminLicenseRecord[]> {
  return apiFetch<AdminLicenseRecord[]>('/api/admin/licenses');
}

export async function generateAdminLicense(payload: GenerateLicensePayload): Promise<AdminLicenseRecord> {
  return apiFetch<AdminLicenseRecord>('/api/admin/licenses/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function revokeAdminLicense(licenseId: string, reason?: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/admin/licenses/revoke', {
    method: 'POST',
    body: JSON.stringify({ license_id: licenseId, reason: reason || 'Revoked by Administrator' }),
  });
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>('/api/admin/licenses/stats');
}

