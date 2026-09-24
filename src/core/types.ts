/** Grammatical features shared across target languages. */

export type Num = 'sg' | 'pl';

/** Romanian collapses the six Latin cases into two surface forms. */
export type Case = 'na' | 'gd';

export type Definiteness = 'indef' | 'def';

/**
 * Gender of a REFERENT -- a person in the world. Set by the user's profile.
 * Deliberately distinct from any language's grammatical gender: das Maedchen
 * is grammatically neuter but refers to a girl, and die Lehrkraft is
 * grammatically feminine whoever it denotes.
 */
export type NaturalGender = 'male' | 'female' | 'unspecified';
