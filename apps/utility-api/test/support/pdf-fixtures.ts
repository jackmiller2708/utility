/**
 * Hand-builds a minimal, valid PDF byte buffer with a plain xref table.
 * Poppler's CLIs (pdfinfo/pdftoppm/pdfimages) and Ghostscript accept this
 * without a higher-level PDF-authoring dependency in the test suite.
 *
 * When `embedImage` is true, every page gets its own 1x1 raster image
 * (same XObject content, once per page) — enough to exercise extract-images
 * across a real page range without needing genuinely distinct artwork.
 */
export function buildTestPdf(options: { pages: number; embedImage?: boolean }): Buffer {
  const { pages, embedImage = false } = options;
  const pageObjNumStart = 3;
  const contentObjNum = pageObjNumStart + pages;
  const imageObjNum = contentObjNum + 1;

  const objs: Buffer[] = [];
  objs.push(Buffer.from(`<< /Type /Catalog /Pages 2 0 R >>`));

  const kids = Array.from({ length: pages }, (_, i) => `${pageObjNumStart + i} 0 R`).join(" ");
  objs.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`));

  for (let i = 0; i < pages; i++) {
    objs.push(
      Buffer.from(
        embedImage
          ? `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 ${imageObjNum} 0 R >> >> /MediaBox [0 0 100 100] /Contents ${contentObjNum} 0 R >>`
          : `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents ${contentObjNum} 0 R >>`
      )
    );
  }

  const content = Buffer.from(embedImage ? "q 50 0 0 50 10 10 cm /Im0 Do Q" : "1 0 0 RG 0 0 50 50 re S");
  objs.push(
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from("\nendstream"),
    ])
  );

  if (embedImage) {
    const imgData = Buffer.from([255]);
    objs.push(
      Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${imgData.length} >>\nstream\n`
        ),
        imgData,
        Buffer.from("\nendstream"),
      ])
    );
  }

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [0];
  let pos = chunks[0].length;

  objs.forEach((body, idx) => {
    offsets.push(pos);
    const header = Buffer.from(`${idx + 1} 0 obj\n`);
    const footer = Buffer.from("\nendobj\n");
    chunks.push(header, body, footer);
    pos += header.length + body.length + footer.length;
  });

  const xrefOffset = pos;
  const n = objs.length + 1;
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(Buffer.from(xref), Buffer.from(trailer));

  return Buffer.concat(chunks);
}
