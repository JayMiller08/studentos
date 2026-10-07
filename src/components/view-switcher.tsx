import { ContinuousTabs, type ContinuousTabsProps } from '@/components/watermelon/continuous-tabs'

/**
 * A segmented control for switching what a page shows.
 *
 * Deliberately not `<Tabs>`. These controls change the content of the page
 * itself rather than revealing a tabpanel, so there is nothing for a tab's
 * `aria-controls` to point at — Radix emitted an id that never existed, which
 * axe flags as a critical `aria-valid-attr-value` failure. A radiogroup
 * describes what this actually is: pick one of several views.
 *
 * Rendered by the Watermelon continuous-tabs component, which keeps that
 * radiogroup behaviour and adds the sliding pill. Pages import this name, so
 * swapping the implementation never touches them.
 */
export function ViewSwitcher<T extends string>(props: ContinuousTabsProps<T>) {
  return <ContinuousTabs {...props} />
}
