export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(words[0] ?? "");
  const last = Array.from(words.at(-1) ?? "");

  const initials =
    words.length > 1 ? `${first[0]}${last[0]}` : first.slice(0, 2).join("");
  return initials.toLocaleUpperCase("pt-BR");
}
