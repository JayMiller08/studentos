import { byUser, table } from '@/services/db'
import type { Note, NoteFolder, NoteVersion } from '@/types/models'

const notes = () => table<Note>('notes')
const folders = () => table<NoteFolder>('note_folders')
const versions = () => table<NoteVersion>('note_versions')

const MAX_VERSIONS_PER_NOTE = 20

export const notesService = {
  async listFolders(userId: string): Promise<NoteFolder[]> {
    return folders().list({
      filters: byUser(userId),
      orderBy: { column: 'sort_order', ascending: true },
    })
  },

  async createFolder(userId: string, name: string): Promise<NoteFolder> {
    return folders().insert({ user_id: userId, name, sort_order: 0 })
  },

  async renameFolder(id: string, name: string): Promise<NoteFolder> {
    return folders().update(id, { name })
  },

  async removeFolder(id: string): Promise<void> {
    return folders().remove(id) // notes keep existing with folder_id = null (DB: ON DELETE SET NULL)
  },

  async list(userId: string): Promise<Note[]> {
    return notes().list({
      filters: byUser(userId),
      orderBy: { column: 'updated_at', ascending: false },
    })
  },

  async create(userId: string, folderId: string | null): Promise<Note> {
    return notes().insert({
      user_id: userId,
      folder_id: folderId,
      title: 'Untitled',
      content_md: '',
      tags: [],
      pinned: false,
      module_id: null,
    })
  },

  /**
   * Save a note. When the content meaningfully changed, snapshot the previous
   * state into version history (capped at MAX_VERSIONS_PER_NOTE).
   */
  async save(note: Note, patch: Partial<Pick<Note, 'title' | 'content_md' | 'tags' | 'pinned' | 'folder_id' | 'module_id'>>): Promise<Note> {
    const contentChanged =
      patch.content_md !== undefined &&
      patch.content_md !== note.content_md &&
      note.content_md.trim().length > 0
    if (contentChanged) {
      await versions().insert({
        note_id: note.id,
        user_id: note.user_id,
        title: note.title,
        content_md: note.content_md,
      })
      const history = await versions().list({
        filters: [{ column: 'note_id', op: 'eq', value: note.id }],
        orderBy: { column: 'created_at', ascending: false },
      })
      for (const stale of history.slice(MAX_VERSIONS_PER_NOTE)) {
        await versions().remove(stale.id)
      }
    }
    return notes().update(note.id, patch)
  },

  async remove(id: string): Promise<void> {
    return notes().remove(id)
  },

  async listVersions(userId: string, noteId: string): Promise<NoteVersion[]> {
    return versions().list({
      filters: byUser(userId, [{ column: 'note_id', op: 'eq', value: noteId }]),
      orderBy: { column: 'created_at', ascending: false },
    })
  },

  async restoreVersion(note: Note, version: NoteVersion): Promise<Note> {
    return notesService.save(note, { title: version.title, content_md: version.content_md })
  },
}

/** Case-insensitive search across title, content and tags. */
export function searchNotes(noteList: Note[], query: string): Note[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return noteList
  return noteList.filter(
    (note) =>
      note.title.toLowerCase().includes(trimmed) ||
      note.content_md.toLowerCase().includes(trimmed) ||
      note.tags.some((tag) => tag.toLowerCase().includes(trimmed)),
  )
}
