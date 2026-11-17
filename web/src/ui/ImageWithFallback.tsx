import { useState, type ImgHTMLAttributes, type ReactNode } from 'react'

interface ImageWithFallbackProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  src?: string | null
  fallback: ReactNode
}

/** Shows the fallback when an image is absent or cannot load. A changed source is tried again. */
export function ImageWithFallback({ src, fallback, ...props }: ImageWithFallbackProps) {
  const [failedSource, setFailedSource] = useState<string>()
  return src && src !== failedSource ? <img {...props} src={src} onError={() => setFailedSource(src)} /> : fallback
}
