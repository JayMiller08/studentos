/**
 * South African higher-education institutions, offered as a selectable list
 * during onboarding and in settings. Covers all 26 public universities plus
 * the most common private providers, ending with an "Other" escape hatch.
 */
export const SA_INSTITUTIONS: readonly string[] = [
  // ── Traditional universities ──
  'University of Cape Town',
  'University of the Witwatersrand',
  'Stellenbosch University',
  'University of Pretoria',
  'University of KwaZulu-Natal',
  'Rhodes University',
  'University of the Free State',
  'University of the Western Cape',
  'North-West University',
  'University of Limpopo',
  'University of Venda',
  'University of Zululand',
  'University of Fort Hare',
  'Sefako Makgatho Health Sciences University',
  // ── Comprehensive universities ──
  'University of Johannesburg',
  'Nelson Mandela University',
  'University of South Africa (UNISA)',
  'Walter Sisulu University',
  'University of Mpumalanga',
  'Sol Plaatje University',
  // ── Universities of technology ──
  'Cape Peninsula University of Technology',
  'Durban University of Technology',
  'Tshwane University of Technology',
  'Vaal University of Technology',
  'Central University of Technology',
  'Mangosuthu University of Technology',
  // ── Common private institutions ──
  'The IIE (Varsity College / Vega / Rosebank College)',
  'Boston City Campus',
  'Damelin',
  'Regenesys Business School',
  'Milpark Education',
  'AFDA',
  'Richfield',
  'TVET College',
  // ── Escape hatch ──
  'Other',
] as const
