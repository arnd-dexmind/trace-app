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
  total: number;
  pending: number;
  dead: number;
  completed: number;
  done: boolean;
  failed: boolean;
  jobs: ProcessingJob[];
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

export interface BulkActionResult {
  observationId: string;
  status: "ok" | "error";
  error?: string;
}

export function bulkProcessActions(body: { itemIds: string[]; action: "accept" | "reject" }) {
  return request<{ results: BulkActionResult[] }>("/api/review/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
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

export interface ItemSearchParams {
  name?: string;
  zoneId?: string;
  category?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  status?: string;
  sort?: "name" | "category" | "zone" | "lastSeen" | "confidence";
  order?: "asc" | "desc";
  cursor?: string;
  limit?: number;
}

export function searchItems(spaceId: string, opts?: string | ItemSearchParams) {
  if (typeof opts === "string" || opts === undefined) {
    const name = opts || undefined;
    const p = new URLSearchParams();
    if (name) p.set("name", name);
    const qs = p.toString();
    return request<InventoryItem[]>(`/api/spaces/${spaceId}/inventory${qs ? `?${qs}` : ""}`);
  }
  const p = new URLSearchParams();
  if (opts.name) p.set("name", opts.name);
  if (opts.zoneId) p.set("zoneId", opts.zoneId);
  if (opts.category) p.set("category", opts.category);
  if (opts.confidenceMin !== undefined) p.set("confidenceMin", String(opts.confidenceMin));
  if (opts.confidenceMax !== undefined) p.set("confidenceMax", String(opts.confidenceMax));
  if (opts.status) p.set("status", opts.status);
  if (opts.sort) p.set("sort", opts.sort);
  if (opts.order) p.set("order", opts.order);
  if (opts.cursor) p.set("cursor", opts.cursor);
  if (opts.limit !== undefined) p.set("limit", String(opts.limit));
  const qs = p.toString();
  return request<InventoryItem[]>(`/api/spaces/${spaceId}/inventory${qs ? `?${qs}` : ""}`);
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

export interface FetchAllRepairsParams {
  spaceId?: string;
  status?: string;
  severity?: string;
  sort?: string;
}

export function fetchAllRepairs(params: FetchAllRepairsParams) {
  const spaceId = params.spaceId || getSpaceId();
  if (!spaceId) return Promise.resolve({ data: [] as RepairIssue[] });
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.severity) qs.set("severity", params.severity);
  if (params.sort) qs.set("sort", params.sort);
  const q = qs.toString();
  return request<RepairIssue[]>(`/api/spaces/${spaceId}/repairs${q ? `?${q}` : ""}`)
    .then((data) => ({ data }));
}

export function patchRepair(issueId: string, newStatus: string) {
  const spaceId = getSpaceId();
  if (!spaceId) return Promise.reject(new Error("No space selected"));
  return updateRepairStatus(spaceId, issueId, newStatus);
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

// ── Walkthrough Results ──────────────────────────────────────────────────

export interface WalkthroughResultsSummary {
  total: number;
  new: number;
  matched: number;
  relocated: number;
  missing: number;
}

export interface WalkthroughResultItem {
  id: string;
  label: string;
  confidence: number | null;
  resultStatus: "new" | "matched" | "relocated" | "missing";
  category: string | null;
  zoneName: string | null;
  storageLocationName: string | null;
  keyframeUrl: string | null;
  itemId: string | null;
  itemName: string | null;
  previousZoneName: string | null;
  frameRef: string | null;
}

export interface WalkthroughResults {
  walkthroughId: string;
  spaceId: string;
  status: string;
  summary: WalkthroughResultsSummary;
  items: WalkthroughResultItem[];
}

export function getWalkthroughResults(spaceId: string, walkthroughId: string) {
  return request<WalkthroughResults>(
    `/api/spaces/${spaceId}/walkthroughs/${walkthroughId}/results`,
  );
}

export function bulkProcessResults(
  spaceId: string,
  walkthroughId: string,
  body: { observationIds: string[]; action: "accept" | "mark_review" },
) {
  return request<{ processed: number; action: string }>(
    `/api/spaces/${spaceId}/walkthroughs/${walkthroughId}/results/bulk`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

// ── Walkthrough Result Item Detail ────────────────────────────────────────────

export interface WalkthroughResultDetail {
  id: string;
  walkthroughId: string;
  spaceId: string;
  label: string;
  confidence: number | null;
  category: string | null;
  zoneId: string | null;
  zoneName: string | null;
  storageLocationId: string | null;
  storageLocationName: string | null;
  keyframeUrl: string | null;
  bbox: string | null;
  status: string;
  resultStatus: "new" | "matched" | "relocated" | "missing";
  itemId: string | null;
  itemName: string | null;
  previousZoneName: string | null;
  frameRef: string | null;
  createdAt: string;
  walkthroughStatus: string;
  suggestedLabels: { label: string; confidence: number }[];
  prevItemId: string | null;
  nextItemId: string | null;
  itemIndex: number;
  totalItems: number;
  confidenceBreakdown: {
    category: number | null;
    identity: number | null;
    location: number | null;
  } | null;
}

export function getWalkthroughResultItem(
  spaceId: string,
  walkthroughId: string,
  itemId: string,
) {
  return request<WalkthroughResultDetail>(
    `/api/spaces/${spaceId}/walkthroughs/${walkthroughId}/results/${itemId}`,
  );
}

export interface UpdateResultItemInput {
  label?: string;
  category?: string;
  zoneId?: string | null;
  storageLocationId?: string | null;
  status?: "accepted" | "rejected" | "pending";
}

export function updateWalkthroughResultItem(
  spaceId: string,
  walkthroughId: string,
  itemId: string,
  body: UpdateResultItemInput,
) {
  return request<WalkthroughResultDetail>(
    `/api/spaces/${spaceId}/walkthroughs/${walkthroughId}/results/${itemId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

// ── Onboarding ──────────────────────────────────────────────────────────

export interface OnboardingStatus {
  isFirstRun: boolean;
  tourCompleted: boolean;
  tourCurrentStep: number;
  tourDismissed: boolean;
  sampleDataSeeded: boolean;
}

export function getOnboardingStatus() {
  return request<OnboardingStatus>("/api/onboarding/status");
}

export function updateTourStep(step: number) {
  return request<{ tourCurrentStep: number; tourCompleted: boolean; tourDismissed: boolean }>(
    "/api/onboarding/tour/step",
    { method: "POST", body: JSON.stringify({ step }) },
  );
}

export function completeTour() {
  return request<{ tourCompleted: boolean; tourCurrentStep: number }>(
    "/api/onboarding/tour/complete",
    { method: "POST" },
  );
}

export function dismissTour() {
  return request<{ tourDismissed: boolean }>(
    "/api/onboarding/tour/dismiss",
    { method: "POST" },
  );
}

export function resetOnboarding() {
  return request<{ reset: boolean }>(
    "/api/onboarding/reset",
    { method: "POST" },
  );
}

export interface SeedResult {
  seeded: boolean;
  spaceId: string;
  spaceName: string;
  itemCount: number;
  repairCount: number;
}

export function seedSampleData() {
  return request<SeedResult>("/api/onboarding/seed", { method: "POST" });
}

export { getTenantId, getSpaceId };

// ── Reports / Export ────────────────────────────────────────────────────

export async function downloadReport(type: "inventory" | "repairs", format: "pdf" | "csv", spaceId: string) {
  const res = await fetch(`/api/reports/${type}?spaceId=${encodeURIComponent(spaceId)}&format=${format}`, {
    headers: { "x-tenant-id": getTenantId() },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ext = format === "csv" ? "csv" : "pdf";
  a.href = url;
  a.download = `${type}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Walkthrough Comparison ──────────────────────────────────────────────

export interface ComparisonItem {
  id: string;
  label: string;
  zoneName: string | null;
  storageLocationName: string | null;
  confidence: number | null;
  changeType: "added" | "removed" | "changed" | "unchanged";
  baselineLabel: string | null;
  comparisonLabel: string | null;
  baselineZone: string | null;
  comparisonZone: string | null;
  baselineLocation: string | null;
  comparisonLocation: string | null;
  baselineConfidence: number | null;
  comparisonConfidence: number | null;
}

export interface WalkthroughComparison {
  baseline: { id: string; status: string; uploadedAt: string };
  comparison: { id: string; status: string; uploadedAt: string };
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
  items: ComparisonItem[];
}

export function getWalkthroughComparison(baselineId: string, comparisonId: string) {
  return request<WalkthroughComparison>(
    `/api/comparison/walkthroughs?baseline=${baselineId}&comparison=${comparisonId}`,
  );
}

// ── Bulk Inventory Operations ──────────────────────────────────────────

export interface BulkTagResult {
  tagged: number;
  addTags: string[];
  removeTags: string[];
}

export function bulkTagItems(
  spaceId: string,
  body: { itemIds: string[]; addTags: string[]; removeTags: string[] },
) {
  return request<BulkTagResult>(`/api/spaces/${spaceId}/inventory/bulk/tag`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface BulkMoveResult {
  moved: number;
  zoneId: string;
  zoneName: string;
}

export function bulkMoveItems(spaceId: string, body: { itemIds: string[]; zoneId: string }) {
  return request<BulkMoveResult>(`/api/spaces/${spaceId}/inventory/bulk/move`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface BulkDeleteResult {
  deleted: number;
}

export function bulkDeleteItems(spaceId: string, body: { itemIds: string[]; confirm: string }) {
  return request<BulkDeleteResult>(`/api/spaces/${spaceId}/inventory/bulk/delete`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
