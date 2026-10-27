import "regenerator-runtime/runtime.js";
import fs from "node:fs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
export const signatureAsset = () =>
  ["signature.png", "signature.jpg", "signature.jpeg"]
    .map((name) => new URL("./assets/" + name, import.meta.url))
    .find((p) => fs.existsSync(p));
// Fonts are immutable bundle assets; read them once per instance instead of on every download.
const fonts = {};
const fontBytes = (name) =>
  (fonts[name] ??= fs.readFileSync(new URL("./assets/" + name, import.meta.url)));
// Set PUBLIC_BASE_URL in functions/.env when the portal moves to a custom domain.
export const verificationUrl = (id) =>
  (process.env.PUBLIC_BASE_URL || "https://inspiredlearning-vh.web.app").replace(
    /\/+$/,
    "",
  ) +
  "/#/verify/" +
  id;
export const certificateRendering = () => ({
  version: "recognition-v2",
  signatureConfigured: Boolean(signatureAsset()),
});
export async function certificatePdf(c) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fontBytes("NotoSans-Regular.ttf"), {
    subset: true,
  });
  const deva = await pdf.embedFont(
    fontBytes("NotoSansDevanagari-Regular.ttf"),
    { subset: true },
  );
  const page = pdf.addPage([842, 595]);
  const green = rgb(0.07, 0.24, 0.22),
    muted = rgb(0.35, 0.43, 0.4);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 842,
    height: 595,
    color: rgb(0.98, 0.97, 0.94),
  });
  page.drawRectangle({
    x: 22,
    y: 22,
    width: 798,
    height: 551,
    borderColor: green,
    borderWidth: 1,
  });
  const text = (value, y, size = 16, color = green) => {
    const str = String(value || ""),
      font = /[\u0900-\u097f]/.test(str) ? deva : regular;
    let fit = size;
    while (font.widthOfTextAtSize(str, fit) > 720 && fit > 10) fit--;
    page.drawText(str, {
      x: (842 - font.widthOfTextAtSize(str, fit)) / 2,
      y,
      size: fit,
      font,
      color,
    });
  };
  text("INSPIREDLEARNING", 520, 15);
  if (c.status !== "issued")
    text(
      "REVOKED / SUPERSEDED — ADMINISTRATOR PREVIEW",
      488,
      13,
      rgb(0.65, 0.15, 0.12),
    );
  text(
    c.kind === "award"
      ? "Certificate of Achievement"
      : "Certificate of Participation",
    447,
    34,
  );
  text("Presented to", 399, 14, muted);
  text(c.name, 347, 32);
  text(
    c.kind === "award" ? c.awardTitle : "for verified participation in",
    304,
    c.kind === "award" ? 24 : 14,
    muted,
  );
  text(c.title, 271, 21);
  text(c.date || "Workshop date not available", 235, 14, muted);
  text(
    "Cloud fundamentals · Architecture · Observability · Teamwork",
    199,
    13,
    muted,
  );
  if (c.kind !== "award" && c.awards?.length) {
    const lines = [];
    let line = "Recognition: ";
    for (const award of c.awards) {
      if ((line + award).length > 85) {
        lines.push(line);
        line = "";
      }
      line += (line && line !== "Recognition: " ? " · " : "") + award;
    }
    if (line) lines.push(line);
    lines.slice(0, 4).forEach((v, i) => text(v, 180 - i * 15, 11));
  }
  const signaturePath = signatureAsset();
  if (signaturePath) {
    const bytes = fs.readFileSync(signaturePath);
    const signature = signaturePath.pathname.endsWith(".png")
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
    const scale = Math.min(180 / signature.width, 40 / signature.height);
    page.drawImage(signature, {
      x: (842 - signature.width * scale) / 2,
      y: 111,
      width: signature.width * scale,
      height: signature.height * scale,
    });
    text("Workshop facilitator", 99, 10, muted);
  }
  text("Certificate " + c.id + " · Revision " + c.revision, 77, 10, muted);
  const qr = await pdf.embedPng(
    await QRCode.toDataURL(verificationUrl(c.id)),
  );
  page.drawImage(qr, { x: 734, y: 44, width: 60, height: 60 });
  pdf.setTitle(
    c.kind === "award"
      ? "InspiredLearning · Certificate of Achievement"
      : "InspiredLearning · Certificate of Participation",
  );
  pdf.setAuthor("InspiredLearning");
  pdf.setSubject(
    "Verify certificate status through the verification QR; public verification requires the learner’s permission.",
  );
  return Buffer.from(await pdf.save());
}
