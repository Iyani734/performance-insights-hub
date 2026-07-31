export function isSeededDemoPayload(value: unknown) {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as { demo?: unknown }).demo === true;
}

export function isSeededDemoSource(source: unknown) {
  return source === "demo";
}

export function isSeededDemoUpload(fileName: unknown) {
  return typeof fileName === "string" && fileName.toLowerCase().startsWith("demo-");
}

export function isSeededDemoEmail(email: unknown) {
  return typeof email === "string" && email.toLowerCase().endsWith(".example");
}

export function isSeededDemoNote(authorName: unknown) {
  return authorName === "Demo Operations Manager";
}
