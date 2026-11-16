// The one place that grabs the camera's current frame as a JPEG: for watching the bench,
// Ask an Expert (base64, the form askAboutFrame takes) and the capture test page.

// Longest side of the frame, in pixels.
const FRAME_MAX_SIDE = 768

export type Frame = { url: string; base64: string; width: number; height: number; bytes: number }

// Returns null while the video has no picture yet.
export function grabFrame(video: HTMLVideoElement | null): Frame | null {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null
  const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.85)
  const base64 = url.split(',')[1]
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return { url, base64, width: canvas.width, height: canvas.height, bytes: (base64.length * 3) / 4 - padding }
}

export function grabFrameBase64(video: HTMLVideoElement | null): string | null {
  return grabFrame(video)?.base64 ?? null
}
