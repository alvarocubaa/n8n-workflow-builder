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

function getDateGroup(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const convDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (convDate.getTime() === today.getTime()) return 'Today';
  if (convDate.getTime() === yesterday.getTime()) return 'Yesterday';
  if (now.getTime() - convDate.getTime() < 7 * 86400000) return 'This week';
  return 'Older';
}

export default function ConversationList({ activeId }: ConversationListProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/conversations')
      .then(r => (r.ok ? r.json() : Promise.resolve([])))
      .then((data: ConversationSummary[]) =>
        setConversations(Array.isArray(data) ? data : [])
      )
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [activeId]);

  const filtered = search.trim()
    ? conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  // Group conversations by date
  const groups: { label: string; items: ConversationSummary[] }[] = [];
  let currentGroup = '';
  for (const conv of filtered) {
    const group = getDateGroup(conv.updatedAt);
    if (group !== currentGroup) {
      groups.push({ label: group, items: [] });
      currentGroup = group;
    }
    groups[groups.length - 1].items.push(conv);
  }

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-warm-100 bg-warm-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-warm-100 px-4 py-3">
        <span className="text-sm font-semibold text-guesty-400">Conversations</span>
        <button
          onClick={() => router.push('/chat')}
          className="flex items-center gap-1 rounded-full bg-guesty-300 px-2.5 py-1 text-xs font-medium text-white hover:bg-guesty-400 transition"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-warm-100 bg-white px-2.5 py-1.5">
          <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent text-xs text-gray-700 placeholder:text-gray-400 outline-none"
          />
        </div>
      </div>

      {/* List */}
      <nav className="flex-1 overflow-y-auto pb-2">
        {loading ? (
          <div className="space-y-2 px-3 py-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-warm-100/50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-warm-100/50">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <p className="text-xs text-gray-400">
              {search ? 'No matching conversations' : 'No conversations yet'}
            </p>
            {!search && (
              <p className="mt-0.5 text-xs text-gray-400">Start by describing a workflow!</p>
            )}
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <p className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                {group.label}
              </p>
              <ul className="space-y-0.5 px-2">
                {group.items.map(conv => (
                  <li key={conv.id}>
                    <Link
                      href={`/chat/${conv.id}`}
                      className={`block rounded-lg px-3 py-2 text-sm transition ${
                        conv.id === activeId
                          ? 'bg-guesty-100/40 text-guesty-400 border-l-2 border-guesty-300'
                          : 'text-gray-700 hover:bg-warm-100/50'
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
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
