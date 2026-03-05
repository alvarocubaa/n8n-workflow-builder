'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationListProps {
  activeId?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ConversationList({ activeId }: ConversationListProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/conversations')
      .then(r => (r.ok ? r.json() : Promise.resolve([])))
      .then((data: ConversationSummary[]) =>
        setConversations(Array.isArray(data) ? data : [])
      )
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [activeId]); // Refresh list when active conversation changes

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <span className="text-sm font-semibold text-gray-700">History</span>
        <button
          onClick={() => router.push('/chat')}
          className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {/* List */}
      <nav className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="space-y-2 px-3 py-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-gray-200" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            No conversations yet.
            <br />Start by describing a workflow!
          </p>
        ) : (
          <ul className="space-y-0.5 px-2">
            {conversations.map(conv => (
              <li key={conv.id}>
                <Link
                  href={`/chat/${conv.id}`}
                  className={`block rounded-md px-3 py-2 text-sm transition ${
                    conv.id === activeId
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <p className="truncate font-medium">{conv.title}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {timeAgo(conv.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
