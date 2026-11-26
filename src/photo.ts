// Shrinks a photo in the browser to a JPEG of at most maxBytes (#105: an expert's answer
// photo). The long side goes down to 1280 px and the quality steps down until it fits.
export async function shrinkPhoto(file: Blob, maxBytes: number): Promise<Uint8Array> {
  const image = await createImageBitmap(file)
  try {
    for (const side of [1280, 960, 720, 480]) {
      const scale = Math.min(1, side / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
        if (blob && blob.size <= maxBytes) return new Uint8Array(await blob.arrayBuffer())
      }
    }
  } finally {
    image.close()
  }
  throw new Error('This photo cannot be made small enough.')
}
