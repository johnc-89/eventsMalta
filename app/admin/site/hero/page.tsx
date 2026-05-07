import { redirect } from 'next/navigation'

// Hero is now a block type — edit it in the block builder.
export default function HeroRedirect() {
  redirect('/admin/site/blocks')
}
