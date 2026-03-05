import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import ChatWindow from '@/components/ChatWindow';
import { getConversation } from '@/lib/firestore';
import { getUserFromHeaders } from '@/lib/auth';
import type { Message } from '@/components/MessageBubble';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExistingChatPage({ params }: Props) {
  const { id } = await params;

  const hdrs = await headers();
  const user = getUserFromHeaders(new Headers(Object.fromEntries(hdrs.entries())));
  if (!user) notFound();

  const conversation = await getConversation(user.email, id);
  if (!conversation) notFound();

  const initialMessages: Message[] = conversation.messages.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
  }));

  return (
    <ChatWindow
      conversationId={id}
      initialMessages={initialMessages}
      initialDepartmentId={conversation.departmentId}
    />
  );
}
