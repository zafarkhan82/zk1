import { Platform } from 'react-native';

/** Bild im Browser wählen, quadratisch zuschneiden und stark verkleinert als JPEG-Data-URL liefern (Profilbilder, Logos) */
export function pickSquareImage(size = 160, quality = 0.72): Promise<string | null | 'error'> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input); // iOS Safari öffnet die Auswahl zuverlässiger, wenn das Feld im Dokument ist
    input.onchange = () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        URL.revokeObjectURL(url);
        if (!ctx) return resolve('error');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        let q = quality;
        let data = canvas.toDataURL('image/jpeg', q);
        while (data.length > 38000 && q > 0.3) {
          q -= 0.1;
          data = canvas.toDataURL('image/jpeg', q);
        }
        resolve(data.length > 40000 ? 'error' : data);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('error');
      };
      img.src = url;
    };
    input.click();
  });
}
