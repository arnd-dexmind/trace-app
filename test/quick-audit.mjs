// Simple direct screenshots via curl + analysis

const BASE = "http://localhost:5173";
const API = "http://localhost:3001";

async function seed() {
  await fetch(`${API}/api/onboarding/tour/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-id": "qa-audit" },
  });
  const r = await fetch(`${API}/api/spaces`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-id": "qa-audit" },
    body: JSON.stringify({ name: "Audit Space", description: "QA" }),
  });
  const space = await r.json();
  for (const item of [
    { name: "Hammer", category: "Tools", quantity: 2 },
    { name: "Screwdriver", category: "Tools", quantity: 1 },
  ]) {
    await fetch(`${API}/api/spaces/${space.id}/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": "qa-audit" },
      body: JSON.stringify(item),
    });
  }
  return space.id;
}

async function main() {
  await seed();
  console.log("Seeded");
  console.log("API: " + BASE);
  console.log("Pages to test:");
  console.log("  " + BASE + "/");
  console.log("  " + BASE + "/items");
  console.log("  " + BASE + "/repairs");
  console.log("  " + BASE + "/upload");
  console.log("  " + BASE + "/review");
  console.log("  " + BASE + "/spaces");
  console.log("  " + BASE + "/settings");
}

main();
