import { lazy, Suspense, type ComponentProps } from 'react'
import type { RichTextEditor as Editor } from '@/features/school/RichTextEditor'
import { Skeleton } from '@/components/ui/skeleton'
const LazyEditor = lazy(() => import('@/features/school/RichTextEditor').then(module => ({ default: module.RichTextEditor })))
export function RichTextEditor(props: ComponentProps<typeof Editor>) {
  return <Suspense fallback={<div role="status" className="grid gap-3"><span className="text-sm text-muted-foreground">Loading editor…</span><Skeleton className="h-40 w-full" /></div>}><LazyEditor {...props} /></Suspense>
}
