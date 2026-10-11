import qrcode from "qrcode-generator";

// A QR code for a link, as inline SVG: drawn on the server, so it shows with
// script off and needs no image route. One path, one square per dark module,
// with the standard four-module quiet zone so phone cameras pick it up.
export function qrSvg(text: string, label: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = n + quiet * 2;
  let d = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#FFFFFF"/><path d="${d}" fill="#1F1B16"/></svg>`;
}
