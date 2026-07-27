import type { Profile } from '@/types/models'

/**
 * Profile fields every student is asked for during onboarding. Centralized
 * here so onboarding's validation and the Home "complete your profile"
 * notice can never drift out of sync.
 */
export type RequiredProfileField = 'full_name' | 'university' | 'degree' | 'semester' | 'goals'

export const REQUIRED_PROFILE_FIELDS: ReadonlyArray<{
  key: RequiredProfileField
  label: string
}> = [
  { key: 'full_name', label: 'Full name' },
  { key: 'university', label: 'University' },
  { key: 'degree', label: 'Degree' },
  { key: 'semester', label: 'Semester' },
  { key: 'goals', label: 'Goals' },
]

function isFieldMissing(profile: Profile, key: RequiredProfileField): boolean {
  switch (key) {
    case 'full_name':
      return !profile.full_name?.trim()
    case 'university':
      return !profile.university?.trim()
    case 'degree':
      return !profile.degree?.trim()
    case 'semester':
      return profile.semester === null || profile.semester === undefined
    case 'goals':
      return profile.goals.length === 0
  }
}

/** Labels of required fields the profile is still missing, in a stable order. */
export function getMissingProfileFields(profile: Profile | null | undefined): string[] {
  if (!profile) return []
  return REQUIRED_PROFILE_FIELDS.filter((field) => isFieldMissing(profile, field.key)).map(
    (field) => field.label,
  )
}

export function isProfileComplete(profile: Profile | null | undefined): boolean {
  return getMissingProfileFields(profile).length === 0
}
