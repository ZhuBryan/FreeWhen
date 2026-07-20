import { test, expect, type Page } from "@playwright/test";

// Route-mocked group fixture — no database involved. Recurring blocks (no
// `date`) so they show up regardless of which week the grid defaults to.
const GROUP = {
  group: {
    id: "g1",
    slug: "e2etest",
    name: "Study Crew",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  members: [
    {
      id: "m1",
      name: "Alex",
      color: "#e11d48",
      schedule: [{ day: 0, start: 540, end: 660, label: "CS 350" }],
    },
    {
      id: "m2",
      name: "Sam",
      color: "#0ea5e9",
      schedule: [{ day: 1, start: 600, end: 720, label: "Work" }],
    },
  ],
};

async function mockGroup(page: Page, members: unknown[]) {
  await page.route("**/api/groups/e2etest", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: { group: GROUP.group, members } });
  });
}

test("landing renders and validates", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "actually free",
  );
  const submit = page.getByRole("button", { name: "Create group" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Name your group").fill("Study Crew");
  await expect(submit).toBeEnabled();
});

test("group page renders schedule data", async ({ page }) => {
  await mockGroup(page, GROUP.members);
  await page.goto("/g/e2etest");

  await expect(page.getByText("Alex")).toBeVisible();
  await expect(page.getByText("Sam")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Weekly overlap" }),
  ).toBeVisible();
  await expect(page.getByText("All free")).toBeVisible();
  await expect(page.getByText(/Best times/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plan something" }),
  ).toBeVisible();
});

test("add flow parses pasted text and saves", async ({ page }) => {
  const members: unknown[] = [...GROUP.members];
  await mockGroup(page, members);
  await page.route("**/api/groups/e2etest/members", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    members.push({
      id: "m3",
      name: "Riya",
      color: "#16a34a",
      schedule: [
        { day: 0, start: 540, end: 1020, label: "Work" },
        { day: 2, start: 540, end: 1020, label: "Work" },
      ],
    });
    await route.fulfill({
      status: 201,
      json: { id: "m3", editToken: "tok" },
    });
  });

  await page.goto("/g/e2etest");
  await page.getByRole("button", { name: "+ Add my schedule" }).click();
  await page.getByPlaceholder("e.g. Alex").fill("Riya");
  await page
    .getByPlaceholder("CS 350 - Operating Systems")
    .fill("Work: Mon, Wed 9am - 5pm");

  await expect(
    page
      .getByText(/Detected \d+ block/)
      .or(page.getByText("Parsed as generic")),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save my schedule" }).click();
  await expect(page.getByText("Riya")).toBeVisible();
});

test("draw tab paints blocks", async ({ page }) => {
  await mockGroup(page, GROUP.members);
  await page.goto("/g/e2etest");
  await page.getByRole("button", { name: "+ Add my schedule" }).click();
  await page.getByRole("button", { name: "Draw" }).click();

  const grid = page.getByRole("grid", { name: "Drag to mark busy times" });
  const box = await grid.boundingBox();
  if (!box) throw new Error("paint grid did not render");

  const x = box.x + box.width / 14; // inside the Monday column
  const yStart = box.y + 8;
  await page.mouse.move(x, yStart);
  await page.mouse.down();
  await page.mouse.move(x, yStart + 64, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByText(/\d+ block/)).toBeVisible();
});
