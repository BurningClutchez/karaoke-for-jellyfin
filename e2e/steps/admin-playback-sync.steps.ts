import { expect, Page, BrowserContext } from "@playwright/test";
import { test as base, createBdd } from "playwright-bdd";
import { clearQueue } from "./queue-cleanup";

const test = base.extend<{
  alicePage: Page;
  aliceContext: BrowserContext;
  tvPage: Page;
  tvContext: BrowserContext;
  adminPage: Page;
  adminContext: BrowserContext;
}>({
  aliceContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  alicePage: async ({ aliceContext }, use) => {
    const page = await aliceContext.newPage();
    await use(page);
  },
  tvContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  tvPage: async ({ tvContext }, use) => {
    const page = await tvContext.newPage();
    await use(page);
  },
  adminContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();
    await use(page);
  },
});

export { test };
const { Given, When, Then } = createBdd(test);

// DISABLED (kept for reference): the REST queue API is read-only now; the
// shared clearQueue in ./queue-cleanup removes songs over Socket.IO.
// async function clearQueue(page: Page): Promise<void> {
//   const response = await page.request.get("http://localhost:3000/api/queue");
//   const data = await response.json();
//   const queue = data?.data?.queue || data?.queue || [];
//   for (const item of queue) {
//     if (item.status === "playing") {
//       await page.request.put("http://localhost:3000/api/queue", {
//         data: { action: "skip", userId: item.addedBy || "cleanup" },
//       });
//     } else {
//       await page.request.delete(
//         `http://localhost:3000/api/queue?itemId=${item.id}&userId=${item.addedBy || "cleanup"}`
//       );
//     }
//   }
// }

async function dismissConfirmation(page: Page): Promise<void> {
  const dialog = page.locator("[data-testid='confirmation-dialog']");
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator("button[aria-label='Close']").click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
}

Given(
  "{string} has joined the karaoke session",
  async ({ alicePage }, name: string) => {
    await alicePage.goto("/");
    await alicePage.waitForLoadState("domcontentloaded");
    await clearQueue(alicePage);
    await alicePage.evaluate(() => {
      localStorage.removeItem("karaoke-username");
    });
    await alicePage.reload();
    await alicePage.waitForLoadState("domcontentloaded");
    await alicePage.locator("[data-testid='username-input']").fill(name);
    await alicePage.locator("[data-testid='join-session-button']").click();
    await expect(alicePage.locator("[data-testid='search-tab']")).toBeVisible({
      timeout: 10000,
    });
  }
);

Given("the TV display is connected", async ({ tvPage }) => {
  await tvPage.goto("/tv");
  await tvPage.waitForLoadState("domcontentloaded");
  await expect(
    tvPage.locator("[data-testid='connection-status']")
  ).toContainText("Connected", { timeout: 10000 });
});

Given("the admin page is open", async ({ adminPage }) => {
  await adminPage.goto("/admin");
  await adminPage.waitForLoadState("domcontentloaded");
  await adminPage.evaluate(() => {
    localStorage.setItem("karaoke-admin-username", "Admin (Admin)");
  });
  await adminPage.reload();
  await adminPage.waitForLoadState("domcontentloaded");
  await expect(
    adminPage.locator("[data-testid='playback-controls']")
  ).toBeVisible({ timeout: 15000 });
});

When("Alice adds a song to the queue", async ({ alicePage }) => {
  await alicePage.locator("[data-testid='search-tab']").click();
  await alicePage
    .locator("[data-testid='artist-item']")
    .first()
    .waitFor({ timeout: 60000 });
  await alicePage.locator("[data-testid='artist-item']").first().click();
  await alicePage
    .locator("[data-testid='add-song-button']")
    .first()
    .waitFor({ timeout: 30000 });
  await alicePage.locator("[data-testid='add-song-button']").first().click();
  await dismissConfirmation(alicePage);
});

Then(
  "the admin page should show {string} status",
  async ({ adminPage }, status: string) => {
    await expect(
      adminPage.locator("[data-testid='playback-status']")
    ).toContainText(status, { timeout: 15000 });
  }
);

Then("the admin page should show the seek control", async ({ adminPage }) => {
  await expect(adminPage.locator("[data-testid='seek-control']")).toBeVisible({
    timeout: 30000,
  });
});

Then(
  "the admin page seek slider should update over time",
  async ({ adminPage }) => {
    await expect(adminPage.locator("[data-testid='seek-control']")).toBeVisible(
      { timeout: 30000 }
    );

    const getTime = async () => {
      const text = await adminPage
        .locator("[data-testid='seek-control']")
        .innerText();
      return text;
    };

    const firstReading = await getTime();
    await adminPage.waitForTimeout(4000);
    const secondReading = await getTime();
    expect(secondReading).not.toEqual(firstReading);
  }
);

async function addSongFromArtist(page: Page, artistIndex: number) {
  await page.locator("[data-testid='search-tab']").click();
  const backButton = page.locator("[data-testid='back-button']");
  if (await backButton.isVisible().catch(() => false)) await backButton.click();
  const artist = page.locator("[data-testid='artist-item']").nth(artistIndex);
  await artist.waitFor({ timeout: 60000 });
  await artist.click();
  const add = page.locator("[data-testid='add-song-button']").first();
  await add.waitFor({ timeout: 30000 });
  await add.click();
  await dismissConfirmation(page);
}

async function waitingTitles(page: Page): Promise<string[]> {
  const response = await page.request.get("http://localhost:3000/api/queue");
  const { data } = await response.json();
  return data.queue
    .filter((item: { status: string }) => item.status === "pending")
    .map((item: { mediaItem: { title: string } }) => item.mediaItem.title);
}

let waitingBefore: string[] = [];

When(
  "Alice adds songs by {int} different artists",
  async ({ alicePage }, count: number) => {
    for (let i = 0; i < count; i++) await addSongFromArtist(alicePage, i);
    await expect
      .poll(() => waitingTitles(alicePage), { timeout: 15000 })
      .toHaveLength(count - 1);
    waitingBefore = await waitingTitles(alicePage);
  }
);

When("the admin moves the last waiting song up", async ({ adminPage }) => {
  await adminPage.locator("text=Queue").first().click();
  const items = adminPage.locator("[data-testid='admin-queue-item']");
  await expect(items).toHaveCount(waitingBefore.length, { timeout: 15000 });
  await items.last().locator("[data-testid='admin-move-up']").click();
});

Then(
  "the last two waiting songs should have swapped places",
  async ({ adminPage }) => {
    const expected = [...waitingBefore];
    const n = expected.length;
    [expected[n - 2], expected[n - 1]] = [expected[n - 1], expected[n - 2]];
    await expect
      .poll(() => waitingTitles(adminPage), { timeout: 15000 })
      .toEqual(expected);
    await expect(
      adminPage.locator(
        "[data-testid='admin-queue-item'] [data-testid='song-title']"
      )
    ).toHaveText(expected, { timeout: 15000 });
  }
);

When(
  "the host drags the last waiting song to the top on the TV",
  async ({ tvPage }) => {
    await tvPage.keyboard.press("h");
    await expect(tvPage.locator("[data-testid='host-controls']")).toBeVisible();
    await tvPage.locator("[data-testid='host-tab-queue']").click();
    const items = tvPage.locator("[data-testid='host-queue-item']");
    await expect(items).toHaveCount(waitingBefore.length, { timeout: 15000 });
    await items.last().dragTo(items.first());
  }
);

Then("the last waiting song should now be first", async ({ tvPage }) => {
  const expected = [waitingBefore.at(-1)!, ...waitingBefore.slice(0, -1)];
  await expect
    .poll(() => waitingTitles(tvPage), { timeout: 15000 })
    .toEqual(expected);
  await expect(tvPage.locator("[data-testid='host-queue-title']")).toHaveText(
    expected,
    { timeout: 15000 }
  );
});
