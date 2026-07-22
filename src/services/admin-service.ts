import { table } from '@/services/db'
import type {
  Announcement,
  FeatureFlag,
  Plan,
  Profile,
  SupportTicket,
} from '@/types/models'

/**
 * Admin data access. Every query here is additionally protected server-side
 * by RLS (`is_admin()`), so a non-admin calling these gets empty results even
 * if the UI were bypassed.
 */

const profiles = () => table<Profile>('profiles')
const flags = () => table<FeatureFlag>('feature_flags')
const announcements = () => table<Announcement>('announcements')
const tickets = () => table<SupportTicket>('support_tickets')

export interface AdminMetrics {
  totalUsers: number
  byPlan: Record<Plan, number>
  onboarded: number
  admins: number
  mrrUsd: number
}

export const adminService = {
  async listUsers(): Promise<Profile[]> {
    return profiles().list({ orderBy: { column: 'created_at', ascending: false }, limit: 500 })
  },

  async metrics(): Promise<AdminMetrics> {
    const users = await adminService.listUsers()
    const byPlan: Record<Plan, number> = { free: 0, pro: 0, elite: 0 }
    let onboarded = 0
    let admins = 0
    for (const user of users) {
      byPlan[user.plan] += 1
      if (user.onboarding_completed) onboarded += 1
      if (user.role === 'admin') admins += 1
    }
    const mrrUsd = byPlan.pro * 4.99 + byPlan.elite * 9.99
    return { totalUsers: users.length, byPlan, onboarded, admins, mrrUsd }
  },

  async setUserPlan(userId: string, plan: Plan): Promise<void> {
    await profiles().update(userId, { plan })
  },

  async setUserRole(userId: string, role: 'student' | 'admin'): Promise<void> {
    await profiles().update(userId, { role })
  },

  async listFlags(): Promise<FeatureFlag[]> {
    return flags().list({ orderBy: { column: 'key', ascending: true } })
  },

  async toggleFlag(id: string, enabled: boolean): Promise<void> {
    await flags().update(id, { enabled })
  },

  async listAnnouncements(): Promise<Announcement[]> {
    return announcements().list({ orderBy: { column: 'created_at', ascending: false } })
  },

  async createAnnouncement(input: {
    title: string
    body: string
    level: Announcement['level']
    publish: boolean
  }): Promise<Announcement> {
    return announcements().insert({
      title: input.title,
      body: input.body,
      level: input.level,
      published_at: input.publish ? new Date().toISOString() : null,
      expires_at: null,
    })
  },

  async removeAnnouncement(id: string): Promise<void> {
    await announcements().remove(id)
  },

  async listTickets(): Promise<SupportTicket[]> {
    return tickets().list({ orderBy: { column: 'created_at', ascending: false } })
  },

  async setTicketStatus(id: string, status: SupportTicket['status']): Promise<void> {
    await tickets().update(id, { status })
  },
}
