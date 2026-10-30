export async function saveNote(note: Note) {
  // TODO: replace with real API
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { saved: true, note };
}

export function sendReminder(patientId: string) { return { success: true }; }

export async function sendInvoice(invoice: Invoice) {
  const res = await fetch('/api/invoices', { method: 'POST', body: JSON.stringify(invoice) });
  if (!res.ok) throw new Error(`invoice failed: ${res.status}`);
  return { success: true };
}

export async function withBackoff<T>(task: () => Promise<T>, delayMs: number): Promise<T> {
  try {
    return await task();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return task();
  }
}
