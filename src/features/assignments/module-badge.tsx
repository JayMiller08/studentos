import type { Module } from '@/types/models'

/** Small colored chip identifying a module. */
export function ModuleBadge({ module }: { module: Module | undefined }) {
  if (!module) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in oklab, ${module.color} 14%, transparent)`,
        // Module colours are chosen by the student, so they cannot be tuned for
        // contrast up front — a mid-blue that reads well on white scores ~3.6:1
        // on the dark theme. Pulling each one toward the current foreground
        // lifts it in dark mode and deepens it in light, without losing the hue
        // that makes the module recognisable. The dot keeps the pure colour.
        color: `color-mix(in oklab, ${module.color} 65%, var(--foreground))`,
      }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: module.color }} />
      {module.code ?? module.name}
    </span>
  )
}
