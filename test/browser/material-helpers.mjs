import { expect } from "@playwright/test";
/** Interact with the actual Material popup, never assign its value through JS. */
export async function choose(scope, label, value) {
  const quoted = JSON.stringify(label),
    control = scope
      .locator(`md-outlined-select[data-field-label=${quoted}]`)
      .filter({ visible: true });
  await expect(control).toHaveAttribute("data-menu-state", "closed");
  await control.getByRole("combobox").click();
  await control
    .locator(`md-select-option[data-value=${JSON.stringify(String(value))}]`)
    .click();
  await expect(control).toHaveJSProperty("value", String(value));
  await expect(control).toHaveAttribute("data-menu-state", "closed");
}
export async function openSettings(page) {
  const direct = page
    .getByRole("button", { name: "Settings", exact: true })
    .filter({ visible: true });
  const more = page
    .getByRole("button", { name: "Account and more options", exact: true })
    .filter({ visible: true });
  await expect(direct.or(more).first()).toBeVisible();
  if (await direct.count()) await direct.first().click();
  else {
    await page
      .getByRole("button", { name: "Account and more options", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  }
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function setColorMode(page, mode) {
  const dialog = await openSettings(page);
  await choose(dialog, "Color mode", mode);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
