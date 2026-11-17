// The Surtrix wordmark for every screen's header: navy on the light page, white when
// the system is in dark mode (the same setting the app's colors follow).
export default function Wordmark() {
  return (
    <picture>
      <source srcSet="/brand/surtrix-wordmark-white-480.webp" media="(prefers-color-scheme: dark)" />
      <img className="wordmark" src="/brand/surtrix-wordmark-navy-480.webp" alt="Surtrix" width={160} height={36} />
    </picture>
  )
}
