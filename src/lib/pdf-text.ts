/**
 * The text of a PDF, page by page, read in the browser.
 *
 * Demo mode only: without a backend there is no AI to read a file, so a demo
 * quiz is built on-device from the PDF's own text layer, page by page, which
 * keeps it tailored to the file and lets each question cite its page. With
 * Supabase the file goes to the server and the AI reads it, scans and diagrams
 * included — this module is never loaded there.
 *
 * pdf.js is large, so it is imported on first use and lands in its own chunk.
 */

/** Pages past this are not read: a demo quiz needs a lecture, not a library. */
export const MAX_PDF_PAGES = 200

export async function pdfPages(data: ArrayBuffer): Promise<string[]> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  try {
    const document = await task.promise
    const pages: string[] = []
    for (let number = 1; number <= Math.min(document.numPages, MAX_PDF_PAGES); number += 1) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
    }
    return pages
  } finally {
    await task.destroy()
  }
}
