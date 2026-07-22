export interface DailyQuote {
  text: string
  author: string
}

const QUOTES: DailyQuote[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'The expert in anything was once a beginner.', author: 'Helen Hayes' },
  { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall' },
  { text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
  { text: 'Do the hard jobs first. The easy jobs will take care of themselves.', author: 'Dale Carnegie' },
  { text: 'Motivation gets you going, but discipline keeps you growing.', author: 'John C. Maxwell' },
  { text: 'A year from now you may wish you had started today.', author: 'Karen Lamb' },
  { text: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { text: 'Amateurs sit and wait for inspiration; the rest of us just get up and go to work.', author: 'Stephen King' },
  { text: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
  { text: 'Strive for progress, not perfection.', author: 'Unknown' },
  { text: 'What we learn with pleasure we never forget.', author: 'Alfred Mercier' },
  { text: 'The beautiful thing about learning is that no one can take it away from you.', author: 'B.B. King' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'Concentrate all your thoughts upon the work in hand.', author: 'Alexander Graham Bell' },
]

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000)
}

/** Deterministic quote of the day — same quote all day, changes at midnight. */
export function quoteOfTheDay(date = new Date()): DailyQuote {
  const quote = QUOTES[dayOfYear(date) % QUOTES.length]
  return quote ?? { text: 'Keep going.', author: 'StudentOS' }
}
