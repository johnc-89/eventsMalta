import Link from 'next/link'
import type { SiteSettingsShape } from '@/lib/site-settings'

const COLORS: Record<string, string> = {
  gold:     'bg-brand-gold text-brand-dark',
  teal:     'bg-brand-teal text-white',
  burgundy: 'bg-brand-burgundy text-white',
  dark:     'bg-brand-dark text-white',
}

export default function AnnouncementBanner({ banner }: { banner: SiteSettingsShape['banner'] }) {
  if (!banner.enabled || !banner.message?.trim()) return null
  const cls = COLORS[banner.color] ?? COLORS.gold

  const content = (
    <span className="font-medium text-sm">
      {banner.message}
      {banner.link_label && banner.link_href && (
        <span className="ml-2 underline underline-offset-2 font-semibold">{banner.link_label} →</span>
      )}
    </span>
  )

  return (
    <div className={`${cls} text-center py-2 px-4`}>
      {banner.link_href ? (
        <Link href={banner.link_href} className="hover:opacity-90 transition-opacity">{content}</Link>
      ) : content}
    </div>
  )
}
