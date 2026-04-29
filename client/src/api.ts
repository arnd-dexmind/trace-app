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
    throw new Error(body.message || `HTTP ${res.status}`);
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
}

export function listSpaces() {
  return request<Space[]>("/api/spaces");
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
  observation?: { id: string; label: string; confidence: number | null } | null;
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
}

export function listRepairs(spaceId: string, status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<RepairIssue[]>(`/api/spaces/${spaceId}/repairs${qs}`);
}

export { getTenantId, getSpaceId };
