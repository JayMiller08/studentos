import { describe, expect, it } from 'vitest'
import { getMissingProfileFields, isProfileComplete } from '@/lib/profile-completeness'
import { makeProfile } from '@/test/factories'

describe('isProfileComplete / getMissingProfileFields', () => {
  it('is complete when every required field is filled in', () => {
    expect(isProfileComplete(makeProfile())).toBe(true)
    expect(getMissingProfileFields(makeProfile())).toEqual([])
  })

  it('treats a null profile as having nothing to report', () => {
    expect(isProfileComplete(null)).toBe(true)
    expect(getMissingProfileFields(undefined)).toEqual([])
  })

  it('flags a null or blank full name', () => {
    expect(getMissingProfileFields(makeProfile({ full_name: null }))).toContain('Full name')
    expect(getMissingProfileFields(makeProfile({ full_name: '   ' }))).toContain('Full name')
  })

  it('flags missing university and degree independently', () => {
    expect(getMissingProfileFields(makeProfile({ university: null }))).toEqual(['University'])
    expect(getMissingProfileFields(makeProfile({ degree: null }))).toEqual(['Degree'])
  })

  it('flags a null semester', () => {
    expect(getMissingProfileFields(makeProfile({ semester: null }))).toEqual(['Semester'])
  })

  it('flags an empty goals list', () => {
    expect(getMissingProfileFields(makeProfile({ goals: [] }))).toEqual(['Goals'])
  })

  it('reports every missing field, in a stable order', () => {
    const profile = makeProfile({ full_name: null, degree: null, goals: [] })
    expect(getMissingProfileFields(profile)).toEqual(['Full name', 'Degree', 'Goals'])
    expect(isProfileComplete(profile)).toBe(false)
  })
})
