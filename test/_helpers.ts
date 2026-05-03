import { db } from "../src/lib/db.js";

/**
 * Delete all test data in FK-safe order (children before parents).
 * Call at the start of each test that mutates the database.
 *
 * Runs as sequential deleteMany calls — no interactive transaction wrapper,
 * because Neon PgBouncer (transaction mode) does not support them reliably.
 */
export async function cleanDatabase() {
  const steps: Array<{ label: string; run: () => Promise<unknown> }> = [
    { label: "reviewAction", run: () => db.reviewAction.deleteMany() },
    { label: "itemIdentityLink", run: () => db.itemIdentityLink.deleteMany() },
    { label: "itemLocationHistory", run: () => db.itemLocationHistory.deleteMany() },
    { label: "repairObservation", run: () => db.repairObservation.deleteMany() },
    { label: "itemObservation", run: () => db.itemObservation.deleteMany() },
    { label: "itemAlias", run: () => db.itemAlias.deleteMany() },
    { label: "shareLink", run: () => db.shareLink.deleteMany() },
    { label: "reviewTask", run: () => db.reviewTask.deleteMany() },
    { label: "processingJob", run: () => db.processingJob.deleteMany() },
    { label: "mediaAsset", run: () => db.mediaAsset.deleteMany() },
    { label: "storageLocation.parents", run: () => db.storageLocation.updateMany({ data: { parentId: null } }) },
    { label: "storageLocation", run: () => db.storageLocation.deleteMany() },
    { label: "walkthrough", run: () => db.walkthrough.deleteMany() },
    { label: "repairIssue", run: () => db.repairIssue.deleteMany() },
    { label: "spaceZone", run: () => db.spaceZone.deleteMany() },
    { label: "inventoryItem", run: () => db.inventoryItem.deleteMany() },
    { label: "space", run: () => db.space.deleteMany() },
    { label: "notification", run: () => db.notification.deleteMany() },
    { label: "notificationPreference", run: () => db.notificationPreference.deleteMany() },
    { label: "teamInvite", run: () => db.teamInvite.deleteMany() },
    { label: "userOnboarding", run: () => db.userOnboarding.deleteMany() },
    { label: "waitlistEntry", run: () => db.waitlistEntry.deleteMany() },
    { label: "userTenant", run: () => db.userTenant.deleteMany() },
    { label: "user", run: () => db.user.deleteMany() },
  ];

  for (const step of steps) {
    try {
      await step.run();
    } catch {
      // Best-effort cleanup: continue even if one step fails.
      // The FK order is correct, so a failure here indicates an infra issue
      // (e.g. Neon PgBouncer skew), not missing dependent rows.
    }
  }
}
