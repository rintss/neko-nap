import { expect, test } from "@playwright/test";

test("completes a nap and saves the check-in locally", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "neko nap" })).toBeVisible();

  await page.getByRole("button", { name: "安静" }).click();
  await page.getByRole("button", { name: "自定义" }).click();
  await page.getByRole("spinbutton", { name: "分钟（1–720）" }).fill("1");
  await page.getByRole("button", { name: /开始 nap/ }).click();

  await expect(page.getByRole("button", { name: "提前结束" })).toHaveCount(0);
  await page.getByRole("button", { name: "切换猫咪动画" }).click();
  await page.getByRole("button", { name: "展开其他控制" }).click();
  await expect(page.getByRole("button", { name: "提前结束" })).toBeVisible();
  await page.getByRole("button", { name: "提前结束" }).click();

  await expect(page.getByText("醒啦", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "我醒了" }).click();
  await page.getByRole("button", { name: "睡着了" }).click();
  await page.getByRole("button", { name: "声音有帮助" }).click();
  await page.getByRole("textbox", { name: "随手记一点（可选）" }).fill("自动测试记录");
  await page.getByRole("button", { name: "保存记录" }).click();

  await expect(page.getByRole("heading", { name: "最近的休息" })).toBeVisible();
  await expect(page.getByText("自动测试记录")).toBeVisible();
  await page.getByRole("button", { name: "编辑记录" }).click();
  await page.getByRole("spinbutton", { name: "实际休息（分钟）" }).fill("12");
  await page.getByRole("spinbutton", { name: "原计划（分钟）" }).fill("20");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText(/12\/20 分钟/)).toBeVisible();
  const savedRecords = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("neko-nap-records-v1") || "[]"),
  );
  expect(savedRecords).toHaveLength(1);
  expect(savedRecords[0]).toMatchObject({ outcome: "slept", status: "interrupted" });
  expect(await page.evaluate(() => localStorage.getItem("neko-nap-static-v1"))).toBe("true");
  expect(
    Math.round(
      (Date.parse(savedRecords[0].actualEndedAt) - Date.parse(savedRecords[0].startedAt)) / 60_000,
    ),
  ).toBe(12);
  expect(savedRecords[0].plannedMinutes).toBe(20);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(backup).toMatchObject({ app: "neko-nap", version: 1, still: true });
});

test("rejects malformed backup records before import", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "记录" }).click();

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: "broken-neko-nap-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        app: "neko-nap",
        version: 1,
        exportedAt: new Date().toISOString(),
        records: [{ id: "broken", startedAt: "not-a-date" }],
      }),
    ),
  });

  await expect(page.getByText("无法导入：备份中有无法识别的记录")).toBeVisible();
});

test("warns instead of silently losing data when device storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage blocked", "QuotaExceededError");
    };
  });
  await page.goto("./");

  await expect(page.getByRole("alert")).toContainText("这次更改没有成功保存在设备上");
  await expect(page.getByRole("alert")).toContainText("尽快导出备份");
});

test("saves a YouTube BGM and prepares it for autoplay", async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.abort());
  await page.goto("./");

  await page.getByRole("button", { name: "YouTube BGM" }).click();
  await page
    .getByRole("textbox", { name: "YouTube 链接" })
    .fill("https://youtu.be/M7lc1UVf-VE?t=12");
  await page.getByRole("textbox", { name: "收藏名称（可选）" }).fill("测试钢琴");
  await page.getByRole("button", { name: "保存 BGM" }).click();
  await expect(page.getByText("已保存在这台设备，并设为当前 BGM。")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /测试钢琴/ })).toBeVisible();
  const preferences = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("neko-nap-preferences-v1") || "{}"),
  );
  expect(preferences.soundKind).toBe("youtube");
  expect(preferences.youtubeTracks).toEqual([
    expect.objectContaining({ videoId: "M7lc1UVf-VE", title: "测试钢琴" }),
  ]);

  await page.getByRole("button", { name: "自定义" }).click();
  await page.getByRole("spinbutton", { name: "分钟（1–720）" }).fill("1");
  await page.getByRole("button", { name: /开始 nap/ }).click();
  const player = page.getByTitle("测试钢琴");
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/M7lc1UVf-VE\?.*autoplay=1/,
  );
  await expect(page.getByText("没自动播放的话，点播放器中央")).toBeVisible();
});

test("reloads the core app while offline", async ({ page, context }) => {
  await page.goto("./");
  await page.getByText("安装与离线", { exact: true }).click();
  await expect(page.getByText(/已可离线|准备中/)).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "neko nap" })).toBeVisible();
    await expect(page.getByText("正在离线使用")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
