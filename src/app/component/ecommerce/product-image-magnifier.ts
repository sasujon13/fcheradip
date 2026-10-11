export interface MagnifierImage {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

/** Map the pointer to the actual object-fit:contain image, excluding letterboxing. */
export function productImageMagnifier(image: MagnifierImage, x: number, y: number, listingWidth = image.width) {
  if (![image.width, image.height, image.naturalWidth, image.naturalHeight, listingWidth].every(value => Number.isFinite(value) && value > 0)) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const scale = Math.min(image.width / image.naturalWidth, image.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const offsetX = (image.width - width) / 2;
  const offsetY = (image.height - height) / 2;
  if (x < offsetX || x > offsetX + width || y < offsetY || y > offsetY + height) return null;
  const diameter = Math.min(listingWidth * .8, image.width, image.height);
  const zoom = 4;
  return {
    diameter,
    left: Math.max(0, Math.min(image.width - diameter, x - diameter / 2)),
    top: Math.max(0, Math.min(image.height - diameter, y - diameter / 2)),
    backgroundWidth: width * zoom,
    backgroundHeight: height * zoom,
    backgroundX: diameter / 2 - (x - offsetX) * zoom,
    backgroundY: diameter / 2 - (y - offsetY) * zoom,
  };
}
