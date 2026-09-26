import { expect, Page, BrowserContext } from "@playwright/test";
import { test as base, createBdd } from "playwright-bdd";
import { clearQueue } from "./queue-cleanup";

const test = base.extend<{
  phoneContext: BrowserContext;
  phonePage: Page;
  tvContext: BrowserContext;
  tvPage: Page;
}>({
  phoneContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  phonePage: async ({ phoneContext }, use) => {
    await use(await phoneContext.newPage());
  },
  tvContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  tvPage: async ({ tvContext }, use) => {
    await use(await tvContext.newPage());
  },
});

export { test };
const { Given, When, Then } = createBdd(test);

const BASE_URL = "http://localhost:3000";

Given("the queue is empty", async ({ phonePage }) => {
  await clearQueue(phonePage);
});

Given("the TV display is open", async ({ tvPage }) => {
  await tvPage.goto(`${BASE_URL}/tv`);
  await expect(tvPage.getByTestId("connection-status")).toContainText(
    "Connected",
    { timeout: 15000 }
  );
});

Given("{string} has joined on a phone", async ({ phonePage }, name: string) => {
  await phonePage.goto(BASE_URL);
  await phonePage.getByTestId("username-input").fill(name);
  await phonePage.getByTestId("join-session-button").click();
  await phonePage.getByTestId("search-input").waitFor({ timeout: 15000 });
});

When(
  "the singer opens the artist {string}",
  async ({ phonePage }, artist: string) => {
    const item = phonePage
      .getByTestId("artist-item")
      .filter({ hasText: artist });
    await item.waitFor({ timeout: 30000 });
    await item.click();
    await expect(phonePage.getByText("Back to Artists")).toBeVisible();
  }
);

Then(
  "the song {string} is listed with a Karaoke badge",
  async ({ phonePage }, title: string) => {
    const song = phonePage.getByText(title, { exact: true });
    await expect(song).toBeVisible({ timeout: 30000 });
    await expect(phonePage.getByTitle("CD+G karaoke graphics")).toBeVisible();
  }
);

When("the singer adds the first song", async ({ phonePage }) => {
  await phonePage.getByTestId("add-song-button").first().click();
  const dialog = phonePage.getByTestId("confirmation-dialog");
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator("button[aria-label='Close']").click();
});

Then("the TV shows the CD+G graphics", async ({ tvPage }) => {
  // Lyrics show while the graphics load; the CD+G display replaces them
  const graphics = tvPage.getByTestId("cdg-display");
  await expect(graphics).toBeVisible({ timeout: 60000 });
  await expect(graphics).toHaveAttribute("data-cdg-mode", /canvas|video/);
  await expect(tvPage.getByTestId("cdg-unavailable")).toHaveCount(0);
});

Then("no songs are offered", async ({ phonePage }) => {
  await expect(phonePage.getByText("No songs found")).toBeVisible({
    timeout: 30000,
  });
  await expect(phonePage.getByTestId("add-song-button")).toHaveCount(0);
});
