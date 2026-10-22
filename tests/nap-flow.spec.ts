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
  const savedRecords = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("neko-nap-records-v1") || "[]"),
  );
  expect(savedRecords).toHaveLength(1);
  expect(savedRecords[0]).toMatchObject({ outcome: "slept", status: "interrupted" });
  expect(await page.evaluate(() => localStorage.getItem("neko-nap-static-v1"))).toBe("true");

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
