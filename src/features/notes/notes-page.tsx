import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  Cloud,
  CloudOff,
  Code2,
  FileText,
  FolderPlus,
  History,
  Pin,
  PinOff,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/auth-provider'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { QuotaMeter } from '@/components/quota-meter'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useNoteFolders, useNotes } from '@/features/notes/hooks'
import { RichNoteEditor } from '@/features/notes/rich-note-editor'
import { useAwardXp } from '@/hooks/use-award-xp'
import { usePlan } from '@/hooks/use-plan'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { notePreview, notesService, searchNotes } from '@/services/notes-service'
import type { Note, NoteFolder, NoteVersion } from '@/types/models'

/**
 * Where these notes actually live. Signed into a real account they sync to the
 * cloud and follow you between devices; in local demo mode they do not, and
 * saying so plainly beats implying a backup that isn't there.
 */
function SyncStatus() {
  const { isDemo } = useAuth()
  const Icon = isDemo ? CloudOff : Cloud
  return (
    <span
      className={cn(
        'hidden items-center gap-1.5 text-xs font-medium sm:inline-flex',
        isDemo ? 'text-muted-foreground' : 'text-success',
      )}
      title={
        isDemo
          ? 'Local demo mode — notes are stored on this device only'
          : 'Notes sync to your account and are available on every device'
      }
    >
      <Icon aria-hidden className="size-3.5" />
      {isDemo ? 'This device only' : 'Cloud synced'}
    </span>
  )
}

function useNotesData() {
  return { notes: useNotes(), folders: useNoteFolders() }
}

export function NotesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const awardXp = useAwardXp()
  const { notes: notesQuery, folders: foldersQuery } = useNotesData()

  const notes = notesQuery.data ?? []
  const folders = foldersQuery.data ?? []

  const { plan, quota } = usePlan()
  const noteQuota = quota('notes', notes.length)

  const [query, setQuery] = React.useState('')
  const [activeFolder, setActiveFolder] = React.useState<string | 'all' | 'unfiled'>('all')
  const [editingNote, setEditingNote] = React.useState<Note | null>(null)

  // Opened from a link elsewhere in the app (the dashboard's recent notes).
  // Consumed once and cleared, so closing the editor does not immediately
  // reopen it and the URL stops referring to a note you are no longer editing.
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedNoteId = searchParams.get('note')
  // Resolved outside the effect so it depends on the note itself, whose identity
  // is stable across renders, rather than on the notes array.
  const requestedNote = requestedNoteId
    ? (notes.find((note) => note.id === requestedNoteId) ?? null)
    : null
  React.useEffect(() => {
    if (!requestedNote) return
    setEditingNote(requestedNote)
    setSearchParams({}, { replace: true })
  }, [requestedNote, setSearchParams])

  const invalidateNotes = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.notes(user!.id) })
  const invalidateFolders = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.noteFolders(user!.id) })

  const visibleNotes = React.useMemo(() => {
    let list = notes
    if (activeFolder === 'unfiled') list = list.filter((note) => note.folder_id === null)
    else if (activeFolder !== 'all') list = list.filter((note) => note.folder_id === activeFolder)
    list = searchNotes(list, query)
    // Pinned first, then most-recently updated (service already sorts by updated_at).
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  }, [notes, activeFolder, query])

  const createNote = useMutation({
    mutationFn: () =>
      notesService.create(
        user!.id,
        plan,
        activeFolder !== 'all' && activeFolder !== 'unfiled' ? activeFolder : null,
      ),
    onSuccess: (note) => {
      invalidateNotes()
      void awardXp('note_created')
      setEditingNote(note)
    },
  })

  const createFolder = useMutation({
    mutationFn: (name: string) => notesService.createFolder(user!.id, name),
    onSuccess: invalidateFolders,
  })

  const removeNote = useMutation({
    mutationFn: (id: string) => notesService.remove(id),
    onSuccess: () => {
      invalidateNotes()
      toast.success('Note deleted')
    },
  })

  const togglePin = useMutation({
    mutationFn: (note: Note) => notesService.save(note, { pinned: !note.pinned }),
    onSuccess: invalidateNotes,
  })

  function handleNewFolder() {
    const name = window.prompt('Folder name')?.trim()
    if (name) createFolder.mutate(name)
  }

  const countFor = (folderId: string) => notes.filter((note) => note.folder_id === folderId).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notes"
        description="Write, organise and search your notes — with version history"
        actions={
          <>
            <SyncStatus />
            <Button onClick={() => createNote.mutate()} disabled={noteQuota.atLimit}>
              <Plus /> New note
            </Button>
          </>
        }
      />

      <QuotaMeter usage={noteQuota} noun="notes" />

      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        {/* Folders sidebar */}
        <Card data-tour="notes-folders" className="h-fit gap-2 py-3">
          <CardContent className="space-y-1 px-3">
            <FolderButton
              label="All notes"
              count={notes.length}
              active={activeFolder === 'all'}
              onClick={() => setActiveFolder('all')}
            />
            <FolderButton
              label="Unfiled"
              count={notes.filter((n) => n.folder_id === null).length}
              active={activeFolder === 'unfiled'}
              onClick={() => setActiveFolder('unfiled')}
            />
            {folders.length > 0 ? <div className="bg-border my-1 h-px" /> : null}
            {folders.map((folder) => (
              <FolderButton
                key={folder.id}
                label={folder.name}
                count={countFor(folder.id)}
                active={activeFolder === folder.id}
                onClick={() => setActiveFolder(folder.id)}
                onDelete={() =>
                  notesService.removeFolder(folder.id).then(() => {
                    invalidateFolders()
                    invalidateNotes()
                    if (activeFolder === folder.id) setActiveFolder('all')
                  })
                }
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start"
              onClick={handleNewFolder}
            >
              <FolderPlus /> New folder
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div data-tour="notes-search" className="relative">
            <Search aria-hidden className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes, content and tags…"
              className="pl-9"
              aria-label="Search notes"
            />
          </div>

          {visibleNotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={query ? 'No matching notes' : 'No notes here yet'}
              description={
                query
                  ? 'Try a different search term.'
                  : 'Capture lecture notes, summaries and ideas — formatting is a click away.'
              }
              action={
                !query ? (
                  <Button onClick={() => createNote.mutate()} disabled={noteQuota.atLimit}>
                    <Plus /> New note
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onOpen={() => setEditingNote(note)}
                  onTogglePin={() => togglePin.mutate(note)}
                  onDelete={() => removeNote.mutate(note.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editingNote ? (
        <NoteEditor
          note={editingNote}
          folders={folders}
          onClose={() => setEditingNote(null)}
          onSaved={invalidateNotes}
        />
      ) : null}
    </div>
  )
}

function FolderButton({
  label,
  count,
  active,
  onClick,
  onDelete,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
          active ? 'bg-accent font-medium' : 'hover:bg-accent',
        )}
      >
        <span className="flex-1 truncate">{label}</span>
        <span className="text-muted-foreground text-xs">{count}</span>
      </button>
      {onDelete ? (
        <button
          type="button"
          aria-label={`Delete folder ${label}`}
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive absolute top-1/2 right-7 hidden -translate-y-1/2 group-hover:block"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function NoteCard({
  note,
  onOpen,
  onTogglePin,
  onDelete,
}: {
  note: Note
  onOpen: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const preview = notePreview(note)
  return (
    <Card className="group hover:border-primary/40 gap-2 py-4 transition-colors">
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <h3 className="truncate font-medium">{note.title || 'Untitled'}</h3>
          </button>
          <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" aria-label={note.pinned ? 'Unpin' : 'Pin'} onClick={onTogglePin}>
              {note.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete note" onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          {note.pinned ? <Pin aria-label="Pinned" className="text-primary size-3.5 shrink-0 group-hover:hidden" /> : null}
        </div>
        <button type="button" onClick={onOpen} className="block w-full text-left">
          <p className="text-muted-foreground line-clamp-3 text-sm">
            {preview || 'Empty note'}
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {note.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px]">
              <Tag className="size-2.5" /> {tag}
            </span>
          ))}
          <span className="text-muted-foreground/70 ml-auto text-[11px]">
            {formatDistanceToNow(parseISO(note.updated_at), { addSuffix: true })}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

const UNFILED = 'unfiled'

const MARKDOWN_MODE_KEY = 'studentos.notes.markdown-mode'

/**
 * Whether to show the raw Markdown source instead of the rich editor.
 *
 * Off by default — the whole point is that a student should not need to know
 * Markdown exists — but remembered for the people who prefer writing it.
 */
function loadMarkdownMode(): boolean {
  try {
    return localStorage.getItem(MARKDOWN_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

function NoteEditor({
  note,
  folders,
  onClose,
  onSaved,
}: {
  note: Note
  folders: NoteFolder[]
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const [title, setTitle] = React.useState(note.title)
  const [content, setContent] = React.useState(note.content_md)
  const [tags, setTags] = React.useState<string[]>(note.tags)
  const [tagDraft, setTagDraft] = React.useState('')
  const [markdownMode, setMarkdownMode] = React.useState(loadMarkdownMode)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  /**
   * The last state written to the database.
   *
   * Keyed `content_md` to match the row: this object is spread over `note` to
   * tell the service what the note looked like before this save, and a mismatched
   * key silently left `content_md` at the value it had when the dialog opened —
   * so every snapshot in version history was another copy of that same original
   * text rather than the state it replaced.
   */
  const savedRef = React.useRef({ title: note.title, content_md: note.content_md, tags: note.tags })

  React.useEffect(() => {
    try {
      localStorage.setItem(MARKDOWN_MODE_KEY, String(markdownMode))
    } catch {
      // A remembered preference is a convenience, never a reason to fail.
    }
  }, [markdownMode])

  async function moveToFolder(value: string) {
    const folderId = value === UNFILED ? null : value
    await notesService.save({ ...note, title, content_md: content, tags }, { folder_id: folderId })
    onSaved()
  }

  // Debounced autosave — snapshots into version history on content change.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const changed =
        title !== savedRef.current.title ||
        content !== savedRef.current.content_md ||
        tags.join(',') !== savedRef.current.tags.join(',')
      if (!changed) return
      void notesService
        .save({ ...note, ...savedRef.current }, { title, content_md: content, tags })
        .then(() => {
          savedRef.current = { title, content_md: content, tags }
          onSaved()
        })
    }, 800)
    return () => clearTimeout(timer)
  }, [title, content, tags, note, onSaved])

  function addTag() {
    const clean = tagDraft.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (clean && !tags.includes(clean)) setTags([...tags, clean])
    setTagDraft('')
  }

  async function restore(version: NoteVersion) {
    await notesService.restoreVersion({ ...note, title, content_md: content, tags }, version)
    setTitle(version.title)
    setContent(version.content_md)
    savedRef.current = { title: version.title, content_md: version.content_md, tags }
    onSaved()
    setHistoryOpen(false)
    toast.success('Version restored')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-3 sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Edit note</DialogTitle>
          <DialogDescription>Write and format your note; changes save automatically</DialogDescription>
        </DialogHeader>

        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Note title"
          aria-label="Note title"
          className="border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
        />

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => setTags(tags.filter((t) => t !== tag))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                addTag()
              }
            }}
            onBlur={addTag}
            placeholder="+ tag"
            aria-label="Add tag"
            className="text-muted-foreground w-20 bg-transparent text-xs outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 border-y py-1.5">
          <Button
            variant={markdownMode ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={markdownMode}
            title="Edit the raw Markdown behind this note"
            onClick={() => setMarkdownMode((on) => !on)}
          >
            <Code2 /> Markdown
          </Button>
          {folders.length > 0 ? (
            <Select value={note.folder_id ?? UNFILED} onValueChange={(value) => void moveToFolder(value)}>
              <SelectTrigger size="sm" className="ml-1 h-8" aria-label="Move to folder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNFILED}>Unfiled</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto">
                <History /> History
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Version history</SheetTitle>
              </SheetHeader>
              <VersionHistory noteId={note.id} userId={user!.id} onRestore={restore} />
            </SheetContent>
          </Sheet>
        </div>

        {markdownMode ? (
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write in Markdown…  # Heading, **bold**, - lists, `code`"
            aria-label="Note content, Markdown source"
            className="flex-1 resize-none border-0 px-0 font-mono text-sm shadow-none focus-visible:ring-0"
          />
        ) : (
          <RichNoteEditor
            value={content}
            onChange={setContent}
            placeholder="Start writing. Use the buttons above to format — no special characters needed."
          />
        )}

        <p className="text-muted-foreground text-center text-xs">Changes save automatically</p>
      </DialogContent>
    </Dialog>
  )
}

function VersionHistory({
  noteId,
  userId,
  onRestore,
}: {
  noteId: string
  userId: string
  onRestore: (version: NoteVersion) => void
}) {
  const { data: versions = [] } = useQuery({
    queryKey: queryKeys.noteVersions(userId, noteId),
    queryFn: () => notesService.listVersions(userId, noteId),
  })

  if (versions.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">No previous versions yet.</p>
  }

  return (
    <ScrollArea className="h-[calc(100vh-6rem)]">
      <ul className="space-y-2 p-4">
        {versions.map((version) => (
          <li key={version.id} className="rounded-lg border p-3">
            <p className="truncate text-sm font-medium">{version.title || 'Untitled'}</p>
            <p className="text-muted-foreground text-xs">
              {formatDistanceToNow(parseISO(version.created_at), { addSuffix: true })}
            </p>
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
              {version.content_md.replace(/[#*_>`]/g, '').trim() || 'Empty'}
            </p>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => onRestore(version)}>
              Restore this version
            </Button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}
