import type { Module } from '@/types/models'

/** Small colored chip identifying a module. */
export function ModuleBadge({ module }: { module: Module | undefined }) {
  if (!module) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in oklab, ${module.color} 14%, transparent)`,
        color: module.color,
      }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: module.color }} />
      {module.code ?? module.name}
    </span>
  )
}
