'use client';

import { useState } from 'react';
import type { FeedbackEntry } from '@/lib/types';

interface Props {
  feedback: FeedbackEntry[];
}

export default function FeedbackLog({ feedback }: Props) {
  const [filter, setFilter] = useState<'all' | 'up' | 'down'>('all');

  const filtered = filter === 'all'
    ? feedback
    : feedback.filter(f => f.rating === filter);

  return (
    <div className="rounded-lg border border-warm-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-guesty-400">Recent Feedback</h3>
        <div className="flex gap-1">
          {(['all', 'up', 'down'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-xs ${
                filter === f
                  ? 'bg-guesty-100/40 text-guesty-400'
                  : 'text-gray-500 hover:bg-warm-50'
              }`}
            >
              {f === 'all' ? 'All' : f === 'up' ? 'Positive' : 'Negative'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No feedback entries yet</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="pb-2 pr-3">Rating</th>
                <th className="pb-2 pr-3">User</th>
                <th className="pb-2 pr-3">Comment</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((f, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                      f.rating === 'up'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {f.rating === 'up' ? 'Positive' : 'Negative'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-gray-600">
                    {f.userEmail.split('@')[0]}
                  </td>
                  <td className="py-2 pr-3 text-gray-600">
                    {f.comment || <span className="text-gray-300">No comment</span>}
                  </td>
                  <td className="py-2 text-gray-400">
                    {new Date(f.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
