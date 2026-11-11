/**
 * Save the board as a PNG. On phones this opens the share sheet (save to
 * Photos, send to the group chat); elsewhere it downloads a file.
 */
const SCALE = 2.5;

/** Render an <svg> (with concrete colours) to a PNG Blob. */
export async function svgToPngBlob(svg, background){
  const [, , vw, vh] = svg.getAttribute("viewBox").split(" ").map(Number);
  const W = Math.round(vw * SCALE), H = Math.round(vh * SCALE);
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", W);
  clone.setAttribute("height", H);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));

  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d");
  g.fillStyle = background;
  g.fillRect(0, 0, W, H);
  g.drawImage(img, 0, 0, W, H);
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

/** Share (touch devices that support it) or download. */
export async function saveBoardImage(svg, { background, filename }){
  const blob = await svgToPngBlob(svg, background);
  const file = new File([blob], filename, { type:"image/png" });
  const touch = matchMedia("(pointer: coarse)").matches;
  if(touch && navigator.canShare?.({ files:[file] })){
    try{ await navigator.share({ files:[file], title:"Catan map" }); return; }
    catch(e){ if(e.name === "AbortError") return; /* fall through to download */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
