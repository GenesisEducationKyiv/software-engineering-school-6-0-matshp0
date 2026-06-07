function apiUrl() {
  return process.env.MAILPIT_API_URL ?? 'http://localhost:8026/api/v1';
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
  From: { Address: string };
  To: Array<{ Address: string }>;
}

export async function getMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(`${apiUrl()}/messages`);
  const data = (await res.json()) as { messages: MailpitMessage[] | null };
  return data.messages ?? [];
}

export async function clearMessages() {
  await fetch(`${apiUrl()}/messages`, { method: 'DELETE' });
}
