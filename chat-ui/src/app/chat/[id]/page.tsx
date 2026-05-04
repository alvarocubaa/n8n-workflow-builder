import { notFound } from 'next/navigation';
import ChatWindow from '@/components/ChatWindow';
import { getConversation } from '@/lib/firestore';
import { getUserFromServerContext } from '@/lib/auth-server';
import type { Message } from '@/components/MessageBubble';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExistingChatPage({ params }: Props) {
  const { id } = await params;

  const user = await getUserFromServerContext();
  // Layout-level AuthGate already redirects unauthenticated users; this guard
  // is defense-in-depth for direct GET to /chat/[id] before the layout renders.
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
      initialMode={conversation.mode}
    />
  );
}
