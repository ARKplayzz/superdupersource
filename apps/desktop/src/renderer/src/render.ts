// Template images (the Slide PNGs), loaded once and shared. Used to find a guide's cutouts.

const images = new Map<string, HTMLImageElement>()
const listeners = new Set<() => void>()

export function onImagesLoaded(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function image(file: string): HTMLImageElement | null {
  let img = images.get(file)
  if (!img) {
    img = new Image()
    img.src = `./${file}`
    img.onload = () => listeners.forEach((l) => l())
    images.set(file, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}
