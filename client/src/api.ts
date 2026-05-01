const TENANT_KEY = "trace-tenant-id";
const SPACE_KEY = "trace-space-id";

function getTenantId(): string {
  return localStorage.getItem(TENANT_KEY) || "default";
}

export function setTenantId(id: string) {
  localStorage.setItem(TENANT_KEY, id);
}

function getSpaceId(): string | null {
  return localStorage.getItem(SPACE_KEY);
}

export function setSpaceId(id: string) {
  localStorage.setItem(SPACE_KEY, id);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": getTenantId(),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function uploadFile(file: File): Promise<{ url: string; key: string; size: number; mimetype: string }> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "x-tenant-id": getTenantId() },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Upload failed (${res.status})`);
  }

  return res.json();
}

// ── Spaces ────────────────────────────────────────────────────────────

export interface Space {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  repairCount?: number;
  zoneCount?: number;
}

export function listSpaces() {
  return request<Space[]>("/api/spaces");
}

export function getSpace(id: string) {
  return request<Space>(`/api/spaces/${id}`);
}

export function createSpace(input: { name: string; description?: string }) {
  return request<Space>("/api/spaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSpace(id: string, input: { name?: string; description?: string }) {
  return request<Space>(`/api/spaces/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteSpace(id: string) {
  return request<{ deleted: boolean; id: string }>(`/api/spaces/${id}`, {
    method: "DELETE",
  });
}

// ── Walkthroughs ───────────────────────────────────────────────────────

export interface Walkthrough {
  id: string;
  spaceId: string;
  tenantId: string;
  status: "uploaded" | "processing" | "awaiting_review" | "applied";
  uploadedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  metadata: unknown;
  mediaAssets?: MediaAsset[];
  jobs?: ProcessingJob[];
  itemObsCount?: number;
  repairObsCount?: number;
}

export interface MediaAsset {
  id: string;
  walkthroughId: string;
  tenantId: string;
  type: string;
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface ProcessingJob {
  id: string;
  walkthroughId: string;
  tenantId: string;
  stage: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalkthroughProcessingState {
  walkthroughId: string;
  status: string;
  jobs: ProcessingJob[];
  itemObservationCount: number;
  repairObservationCount: number;
}

export function listWalkthroughs(spaceId: string) {
  return request<Walkthrough[]>(`/api/spaces/${spaceId}/walkthroughs`);
}

export function getWalkthrough(spaceId: string, walkthroughId: string) {
  return request<Walkthrough>(`/api/spaces/${spaceId}/walkthroughs/${walkthroughId}`);
}

export function getProcessingState(walkthroughId: string) {
  return request<WalkthroughProcessingState>(`/api/processing/walkthroughs/${walkthroughId}/state`);
}

export function createWalkthrough(spaceId: string, metadata?: Record<string, unknown>) {
  return request<Walkthrough>(`/api/spaces/${spaceId}/walkthroughs`, {
    method: "POST",
    body: JSON.stringify({ metadata }),
  });
}

export function attachMedia(
  spaceId: string,
  walkthroughId: string,
  data: { type: string; url: string; thumbnailUrl?: string },
) {
  return request<MediaAsset>(`/api/spaces/${spaceId}/walkthroughs/${walkthroughId}/media`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function startProcessing(spaceId: string, walkthroughId: string) {
  return request<{ id: string; status: string; processedAt: string | null; reviewTaskCount?: number; observationCount?: number }>(
    `/api/spaces/${spaceId}/walkthroughs/${walkthroughId}/process`,
    { method: "POST" },
  );
}

export function getSignedUploadUrl(originalName: string, mimetype: string) {
  return request<{ signedUrl: string; key: string }>("/api/uploads/sign", {
    method: "POST",
    body: JSON.stringify({ originalName, mimetype }),
  });
}

// ── Review Queue ──────────────────────────────────────────────────────

export interface ReviewTask {
  id: string;
  walkthroughId: string;
  tenantId: string;
  status: "pending" | "completed";
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  walkthrough: {
    id: string;
    spaceId: string;
    status: string;
    uploadedAt: string;
  };
  itemObservations?: ItemObservation[];
  repairObservations?: RepairObservation[];
  actions?: ReviewAction[];
}

export interface ItemObservation {
  id: string;
  walkthroughId: string;
  tenantId: string;
  itemId: string | null;
  zoneId: string | null;
  storageLocationId: string | null;
  label: string;
  confidence: number | null;
  bbox: string | null;
  keyframeUrl: string | null;
  status: string;
  createdAt: string;
  zone?: { id: string; name: string } | null;
  storageLocation?: { id: string; name: string } | null;
}

export interface RepairObservation {
  id: string;
  walkthroughId: string;
  tenantId: string;
  repairIssueId: string | null;
  zoneId: string | null;
  label: string;
  confidence: number | null;
  bbox: string | null;
  keyframeUrl: string | null;
  status: string;
  createdAt: string;
  zone?: { id: string; name: string } | null;
}

export interface ReviewAction {
  id: string;
  reviewTaskId: string;
  tenantId: string;
  actionType: "accept" | "reject" | "merge" | "relabel";
  observationId: string | null;
  itemId: string | null;
  previousLabel: string | null;
  newLabel: string | null;
  note: string | null;
  createdAt: string;
}

export function listReviewQueue(status?: string) {
  const params = status ? `?status=${status}` : "";
  return request<ReviewTask[]>(`/api/review/queue${params}`);
}

export function getReviewTask(taskId: string) {
  return request<ReviewTask>(`/api/review/queue/${taskId}`);
}

export function processAction(
  taskId: string,
  body: {
    actionType: string;
    observationId?: string;
    itemId?: string;
    previousLabel?: string;
    newLabel?: string;
    note?: string;
  },
) {
  return request<ReviewAction>(`/api/review/${taskId}/actions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Inventory ─────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  spaceId: string;
  tenantId: string;
  name: string;
  category: string | null;
  description: string | null;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  locationHistory?: LocationHistoryEntry[];
  identityLinks?: IdentityLink[];
  repairIssues?: RepairIssue[];
  latestLocation?: LocationHistoryEntry | null;
}

export interface LocationHistoryEntry {
  id: string;
  itemId: string;
  tenantId: string;
  zoneId: string | null;
  storageLocationId: string | null;
  observedAt: string;
  sourceObservationId: string | null;
  zone?: { id: string; name: string } | null;
  storageLocation?: { id: string; name: string } | null;
}

export interface IdentityLink {
  id: string;
  observationId: string;
  itemId: string;
  tenantId: string;
  matchConfidence: number | null;
  observation?: { id: string; label: string; confidence: number | null; keyframeUrl: string | null } | null;
}

export function searchItems(spaceId: string, name?: string) {
  const params = name ? `?name=${encodeURIComponent(name)}` : "";
  return request<InventoryItem[]>(`/api/spaces/${spaceId}/inventory${params}`);
}

export function getItem(spaceId: string, itemId: string) {
  return request<InventoryItem>(`/api/spaces/${spaceId}/inventory/${itemId}`);
}

// ── Repairs ───────────────────────────────────────────────────────────

export interface RepairIssue {
  id: string;
  spaceId: string;
  tenantId: string;
  title: string;
  description: string | null;
  severity: string | null;
  status: string;
  itemId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  item?: { id: string; name: string } | null;
  repairObservations?: RepairObservation[];
}

export function listRepairs(spaceId: string, status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<RepairIssue[]>(`/api/spaces/${spaceId}/repairs${qs}`);
}

export function getRepair(spaceId: string, issueId: string) {
  return request<RepairIssue>(`/api/spaces/${spaceId}/repairs/${issueId}`);
}

export interface CreateRepairInput {
  title: string;
  description?: string;
  severity?: string;
  itemId?: string;
}

export function createRepair(spaceId: string, input: CreateRepairInput) {
  return request<RepairIssue>(`/api/spaces/${spaceId}/repairs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRepairStatus(spaceId: string, issueId: string, status: string) {
  return request<RepairIssue>(`/api/spaces/${spaceId}/repairs/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export { getTenantId, getSpaceId };
