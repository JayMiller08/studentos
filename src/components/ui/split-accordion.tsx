/**
 * Re-export so feature code never imports `components/watermelon/*` directly.
 *
 * If a registry component is replaced or dropped, the swap happens here rather
 * than across every page that used it.
 */
export {
  SplitAccordion,
  type SplitAccordionItem,
  type SplitAccordionProps,
} from '@/components/watermelon/card-split-accordian'
