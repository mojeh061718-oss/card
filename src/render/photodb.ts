/**
 * Hero-photo provider seam. The render layer never fetches or stores
 * anything — the app layer registers a synchronous lookup (name → decoded
 * image) and the card press asks for it per card. Returns null when no
 * photo exists, which keeps every default render fully procedural.
 */

export type PhotoProvider = (sport: string, fullName: string) => HTMLImageElement | null;

let provider: PhotoProvider = () => null;

export function setPhotoProvider(fn: PhotoProvider): void {
  provider = fn;
}

export function heroPhoto(sport: string, fullName: string): HTMLImageElement | null {
  return provider(sport, fullName);
}

export type ScanProvider = (setKey: string, num: number) => HTMLImageElement | null;

let scanProvider: ScanProvider = () => null;

export function setScanProvider(fn: ScanProvider): void {
  scanProvider = fn;
}

export function tcgScan(setKey: string, num: number): HTMLImageElement | null {
  return scanProvider(setKey, num);
}
