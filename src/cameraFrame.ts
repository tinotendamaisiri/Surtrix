// Grabs the camera's current frame as a base64 JPEG, the form askAboutFrame and Ask an
// Expert take. Same size and quality as the capture test page (about 50 KB).

// Longest side of the frame, in pixels.
const FRAME_MAX_SIDE = 768

// Returns null while the video has no picture yet.
export function grabFrameBase64(video: HTMLVideoElement | null): string | null {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null
  const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}
