import "regenerator-runtime/runtime.js";
import fs from "node:fs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
export async function certificatePdf(c) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(
    fs.readFileSync(new URL("./assets/NotoSans-Regular.ttf", import.meta.url)),
    { subset: true },
  );
  const deva = await pdf.embedFont(
    fs.readFileSync(
      new URL("./assets/NotoSansDevanagari-Regular.ttf", import.meta.url),
    ),
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
  text("Certificate of Participation", 447, 34);
  text("Presented to", 399, 14, muted);
  text(c.name, 347, 32);
  text("for verified participation in", 304, 14, muted);
  text(c.title, 271, 21);
  text(c.date || "Workshop date recorded by facilitator", 235, 14, muted);
  text(
    "Cloud fundamentals · Architecture · Observability · Teamwork",
    199,
    13,
    muted,
  );
  if (c.awards?.length)
    text("Recognition: " + c.awards.slice(0, 3).join(" · "), 168, 12);
  text("Certificate " + c.id + " · Revision " + c.revision, 77, 10, muted);
  const qr = await pdf.embedPng(
    await QRCode.toDataURL(
      "https://inspiredlearning-vh.web.app/#/verify/" + c.id,
    ),
  );
  page.drawImage(qr, { x: 734, y: 44, width: 60, height: 60 });
  pdf.setTitle("InspiredLearning · Certificate of Participation");
  pdf.setAuthor("InspiredLearning");
  pdf.setSubject(
    "Verify certificate status at inspi.in; public verification requires the learner’s permission.",
  );
  return Buffer.from(await pdf.save());
}
