'use client';

import type { ReactNode } from 'react';
import type { AssistantMode } from '@/lib/types';

interface ModeSelectorProps {
  value: AssistantMode;
  onChange: (mode: AssistantMode) => void;
  disabled?: boolean;
}

const MODES: Array<{
  id: AssistantMode;
  title: string;
  description: string;
  bestFor: string;
  icon: ReactNode;
  selectedClasses: string;
  iconClasses: string;
  textClasses: string;
}> = [
  {
    id: 'builder',
    title: 'Build a Workflow',
    description: 'Design and deploy production-ready n8n workflows.',
    bestFor: 'Automations, integrations, scheduled tasks',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M11.42 15.17l-5.25 5.25a2.121 2.121 0 01-3-3l5.25-5.25m4.5-4.5l5.25-5.25a2.121 2.121 0 013 3l-5.25 5.25m-7.5-3l3 3" />
      </svg>
    ),
    selectedClasses: 'border-guesty-300 bg-guesty-100/20 shadow-md ring-1 ring-guesty-200/50',
    iconClasses: 'bg-guesty-100 text-guesty-300',
    textClasses: 'text-guesty-400',
  },
  {
    id: 'data',
    title: 'Data Consultant',
    description: 'Explore data sources, build queries, and plan AI agents.',
    bestFor: 'Data discovery, SQL queries, agent architecture',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    selectedClasses: 'border-navy-200 bg-navy-50/50 shadow-md ring-1 ring-navy-100/50',
    iconClasses: 'bg-navy-50 text-navy-200',
    textClasses: 'text-navy-300',
  },
];

export default function ModeSelector({ value, onChange, disabled }: ModeSelectorProps) {
  if (disabled) {
    const mode = MODES.find(m => m.id === value);
    return (
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${
          value === 'data'
            ? 'bg-navy-50 text-navy-300 ring-navy-100'
            : 'bg-guesty-100/40 text-guesty-300 ring-guesty-200'
        }`}>
          {mode?.icon && <span className="h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5">{mode.icon}</span>}
          {mode?.title}
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 max-w-xl">
      {MODES.map(mode => {
        const isSelected = value === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => onChange(mode.id)}
            className={`flex flex-col items-center gap-3 rounded-2xl border-2 px-5 py-6 text-center transition-all
              ${isSelected
                ? mode.selectedClasses
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }`}
          >
            <div className={`rounded-xl p-3 transition ${
              isSelected ? mode.iconClasses : 'bg-gray-100 text-gray-400'
            }`}>
              {mode.icon}
            </div>
            <div>
              <div className={`text-sm font-bold ${
                isSelected ? mode.textClasses : 'text-gray-800'
              }`}>
                {mode.title}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {mode.description}
              </div>
              <div className={`mt-2 text-xs font-medium ${
                isSelected ? 'text-gray-500' : 'text-gray-400'
              }`}>
                Best for: {mode.bestFor}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
