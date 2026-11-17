// The Surtrix wordmark for every screen's header: navy on the light page, white when
// the system is in dark mode (the same setting the app's colors follow). The landing
// page (#51) is always dark, so it asks for the white one.
export default function Wordmark({ white = false }: { white?: boolean }) {
  if (white) {
    return <img className="wordmark" src="/brand/surtrix-wordmark-white-480.webp" alt="Surtrix" width={160} height={36} />
  }
  return (
    <picture>
      <source srcSet="/brand/surtrix-wordmark-white-480.webp" media="(prefers-color-scheme: dark)" />
      <img className="wordmark" src="/brand/surtrix-wordmark-navy-480.webp" alt="Surtrix" width={160} height={36} />
    </picture>
  )
}
