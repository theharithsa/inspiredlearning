// Existing domain journeys automatically accept confirmations, as their former
// native-dialog handlers did. Dedicated v2 tests exercise real keyboard/cancel behavior.
export async function acceptConfirmations(page) {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const button = document.querySelector(
        "dialog[open] md-filled-button[data-confirm]",
      );
      if (button && !button.dataset.testScheduled) {
        button.dataset.testScheduled = "true";
        setTimeout(() => button.click(), 120);
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
  });
}
