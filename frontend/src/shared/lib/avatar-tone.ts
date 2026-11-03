export const AVATAR_TONES = [
  "blue",
  "orange",
  "violet",
  "green",
  "rose",
  "yellow",
  "gray",
] as const;

export type AvatarTone = (typeof AVATAR_TONES)[number];

/** Tom fixo por pessoa: soma dos códigos UTF-16 do id, módulo 7. */
export function avatarToneFor(id: string): AvatarTone {
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) {
    sum += id.charCodeAt(index);
  }
  return AVATAR_TONES[sum % AVATAR_TONES.length] ?? "gray";
}
