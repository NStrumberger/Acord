/** Print the showcase translations in both genders. `npm run demo` */
import { realizeClause, type Clause, type Referent } from '../src/ro/frames.ts';

const CASES: { en: string; clause: Clause; extra?: (g: 'male' | 'female') => Referent[] }[] = [
  { en: 'I am a teacher', clause: { frame: 'predicate-noun', subject: 'me', noun: 'teacher' } },
  { en: 'I am an engineer', clause: { frame: 'predicate-noun', subject: 'me', noun: 'engineer' } },
  { en: 'I am a geologist', clause: { frame: 'predicate-noun', subject: 'me', noun: 'geologist' } },
  { en: 'I am tired', clause: { frame: 'predicate-adj', subject: 'me', adj: 'tired' } },
  {
    en: 'my friend (a woman)',
    clause: { frame: 'possessed-noun', possessor: 'me', possessed: 'f', noun: 'friend' },
    extra: () => [{ id: 'f', gender: 'female', person: 3, number: 'sg' }],
  },
  {
    en: 'my friend (a man)',
    clause: { frame: 'possessed-noun', possessor: 'me', possessed: 'f', noun: 'friend' },
    extra: () => [{ id: 'f', gender: 'male', person: 3, number: 'sg' }],
  },
  {
    en: 'I saw them',
    clause: { frame: 'past-transitive', subject: 'me', object: 'them', verb: 'see' },
    extra: (g) => [{ id: 'them', gender: g, person: 3, number: 'sg' }],
  },
];

const render = (c: Clause, refs: Referent[]) => {
  const { tokens } = realizeClause(c, refs);
  const text = tokens.map((t) => t.text).join(' ');
  const flag = tokens.find((t) => t.status && t.status !== 'normative');
  const note = tokens.find((t) => t.note);
  return { text, flag: flag?.status, note: note?.note };
};

for (const { en, clause, extra } of CASES) {
  console.log(`\n"${en}"`);
  for (const g of ['male', 'female'] as const) {
    const me: Referent = { id: 'me', gender: g, person: 1, number: 'sg' };
    const { text, flag, note } = render(clause, [me, ...(extra?.(g) ?? [])]);
    const tag = flag ? `  [${flag}]` : '';
    console.log(`   ${g.padEnd(7)} ${text}${tag}`);
    if (note && flag) console.log(`             ${note}`);
  }
}
console.log('\n"Dumneavoastră sunteți obosit(ă)" — polite address');
for (const g of ['male', 'female'] as const) {
  const you: Referent = { id: 'you', gender: g, person: 2, number: 'sg', verbNumber: 'pl' };
  console.log(`   ${g.padEnd(7)} ${render({ frame: 'predicate-adj', subject: 'you', adj: 'tired' }, [you]).text}`);
}
