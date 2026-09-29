export interface ManualImageCrop {
  id: string;
  targetId: string;
  dataUrl: string;
  sizeBytes: number;
}

export interface CombinedCropImage {
  dataUrl: string;
  sizeBytes: number;
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to read the cropped image.'));
    image.src = dataUrl;
  });
}

export function canvasToWebp(canvas: HTMLCanvasElement): Promise<CombinedCropImage> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) {
        reject(new Error('Unable to create the cropped image.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), sizeBytes: blob.size });
      reader.onerror = () => reject(new Error('Unable to encode the cropped image.'));
      reader.readAsDataURL(blob);
    }, 'image/webp', 0.9);
  });
}

export async function combineCropImages(crops: ManualImageCrop[]): Promise<CombinedCropImage> {
  if (crops.length === 0) throw new Error('Select at least one crop.');
  if (crops.length === 1) {
    return { dataUrl: crops[0].dataUrl, sizeBytes: crops[0].sizeBytes };
  }

  const images = await Promise.all(crops.map(crop => loadImage(crop.dataUrl)));
  const gap = 16;
  const width = Math.max(...images.map(image => image.naturalWidth));
  const height = images.reduce((total, image) => total + image.naturalHeight, 0)
    + gap * (images.length - 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  let top = 0;
  for (const image of images) {
    context.drawImage(image, 0, top);
    top += image.naturalHeight + gap;
  }
  return canvasToWebp(canvas);
}

export function groupCropsByTarget(crops: ManualImageCrop[]) {
  const groups = new Map<string, ManualImageCrop[]>();
  for (const crop of crops) {
    const group = groups.get(crop.targetId) ?? [];
    group.push(crop);
    groups.set(crop.targetId, group);
  }
  return groups;
}
