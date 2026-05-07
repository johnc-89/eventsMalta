import { redirect } from 'next/navigation'

// Section ordering is now driven by the block builder.
export default function SectionsRedirect() {
  redirect('/admin/site/blocks')
}
