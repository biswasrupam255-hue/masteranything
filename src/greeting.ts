export function greet(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new Error("name is required");
  }

  return `Hi, ${trimmed}!`;
}
