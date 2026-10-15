export interface GreetOptions {
  shout?: boolean;
}

export function greet(name: string, options: GreetOptions = {}): string {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new Error("name is required");
  }

  const message = `Hello, ${trimmed}!`;

  return options.shout ? message.toUpperCase() : message;
}
