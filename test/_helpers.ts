import { db } from "../src/lib/db.js";

/**
 * Delete all test data in FK-safe order.
 * Call at the start of each test that mutates the database.
 */
export async function cleanDatabase() {
  await db.reviewAction.deleteMany();
  await db.itemIdentityLink.deleteMany();
  await db.itemLocationHistory.deleteMany();
  await db.repairObservation.deleteMany();
  await db.itemObservation.deleteMany();
  await db.itemAlias.deleteMany();
  await db.reviewTask.deleteMany();
  await db.processingJob.deleteMany();
  await db.mediaAsset.deleteMany();
  await db.storageLocation.updateMany({ data: { parentId: null } });
  await db.storageLocation.deleteMany();
  await db.walkthrough.deleteMany();
  await db.repairIssue.deleteMany();
  await db.spaceZone.deleteMany();
  await db.inventoryItem.deleteMany();
  await db.space.deleteMany();
}
