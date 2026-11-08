import { Homography } from '../vendor/Homography.js';

export function rectifyQuad(srcImageData, quad, outW, outH) {
  if (!(outW > 0) || !(outH > 0)) throw new Error('invalid output size');
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const sx = Math.max(0, Math.floor(Math.min(...xs)));
  const sy = Math.max(0, Math.floor(Math.min(...ys)));
  const ex = Math.min(srcImageData.width, Math.ceil(Math.max(...xs)));
  const ey = Math.min(srcImageData.height, Math.ceil(Math.max(...ys)));
  const sw = ex - sx;
  const sh = ey - sy;
  if (!(sw > 0) || !(sh > 0)) throw new Error('quad is outside the image');

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcImageData.width;
  srcCanvas.height = srcImageData.height;
  srcCanvas.getContext('2d').putImageData(srcImageData, 0, 0);

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  cropCanvas.getContext('2d').drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const cropData = cropCanvas.getContext('2d').getImageData(0, 0, sw, sh);

  const rel = quad.map((p) => [p.x - sx, p.y - sy]);
  const dst = [[0, 0], [outW, 0], [outW, outH], [0, outH]];

  const homo = new Homography('projective');
  homo.setSourcePoints(rel.flat(), cropData, null, null, false);
  homo.setDestinyPoints(dst.flat(), false);
  const warped = homo.warp();

  // vendor contract (calculateTransformLimits, vendor/Homography.js): warped pixel
  // (i,j) corresponds to dst-space (i + _xOutputOffset, j + _yOutputOffset). To place
  // dst-space (0,0) at outCanvas (0,0), draw at (offX, offY).
  const offX = homo._xOutputOffset;
  const offY = homo._yOutputOffset;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const ctx = outCanvas.getContext('2d');
  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = warped.width;
  warpedCanvas.height = warped.height;
  warpedCanvas.getContext('2d').putImageData(warped, 0, 0);
  ctx.drawImage(warpedCanvas, offX, offY);

  const imageData = ctx.getImageData(0, 0, outW, outH);
  return { imageData, canvas: outCanvas, offset: { x: offX, y: offY } };
}
