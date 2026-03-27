'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { AnalyticsEvent } from '@/lib/types';

interface Props {
  events: AnalyticsEvent[];
}

const DEPT_COLORS: Record<string, string> = {
  cs: '#14665F',      // guesty-300
  cx: '#5071E6',      // navy-200
  marketing: '#FA877D', // coral-200
  finance: '#8CBEBE',  // guesty-200
  payments: '#5F1632',  // coral-300
  ob: '#0E0740',       // navy-300
};

export default function UsageOverview({ events }: Props) {
  // Sessions by department
  const deptCounts: Record<string, number> = {};
  for (const e of events) {
    deptCounts[e.departmentId] = (deptCounts[e.departmentId] ?? 0) + 1;
  }
  const deptData = Object.entries(deptCounts)
    .map(([dept, count]) => ({ dept: dept.toUpperCase(), count, fill: DEPT_COLORS[dept] ?? '#94A3B8' }))
    .sort((a, b) => b.count - a.count);

  // Usage over time (by day)
  const dayMap: Record<string, number> = {};
  for (const e of events) {
    const day = e.createdAt.slice(0, 10); // YYYY-MM-DD
    dayMap[day] = (dayMap[day] ?? 0) + 1;
  }
  const dailyData = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date: date.slice(5), count })); // MM-DD

  return (
    <div className="rounded-lg border border-warm-100 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-guesty-400">Usage by Department</h3>

      {deptData.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No sessions recorded yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={deptData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="dept" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" name="Sessions" radius={[4, 4, 0, 0]}>
              {deptData.map((entry, i) => (
                <rect key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <h3 className="mb-4 mt-6 text-sm font-semibold text-guesty-400">Daily Activity</h3>
      {dailyData.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No data yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" name="Sessions" fill="#14665F" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
