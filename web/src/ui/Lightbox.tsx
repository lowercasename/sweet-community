import { useMemo } from 'react'
import YetAnotherLightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'

interface LightboxProps {
  /** The image to show, or null when the lightbox is closed. */
  image: { src: string; alt: string } | null
  onClose: () => void
  /** Called once the lightbox has finished closing, such as to give focus back to the image. */
  onClosed?: () => void
}

/**
 * One image, full screen, on a dark backdrop, with nothing else. Pinching, double-tapping or the mouse wheel zooms.
 * Escape, the close button, a click beside the image or pulling down on a phone closes it.
 */
export function Lightbox({ image, onClose, onClosed }: LightboxProps) {
  const slides = useMemo(() => (image ? [{ src: image.src, alt: image.alt }] : []), [image])
  return (
    <YetAnotherLightbox
      open={image !== null}
      close={onClose}
      slides={slides}
      plugins={[Zoom]}
      carousel={{ finite: true }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      render={{ buttonPrev: () => null, buttonNext: () => null, buttonZoom: () => null }}
      labels={{ Lightbox: 'Image', 'Photo gallery': 'Image' }}
      on={{ exited: onClosed }}
      styles={{ container: { backgroundColor: 'rgba(0, 0, 0, 0.96)' } }}
    />
  )
}
