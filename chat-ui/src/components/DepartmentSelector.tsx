'use client';

import { useState, useEffect } from 'react';

interface Department {
  id: string;
  displayName: string;
  description: string;
}

interface DepartmentSelectorProps {
  value: string;
  onChange: (departmentId: string) => void;
  disabled?: boolean;
}

const DEPT_COLORS: Record<string, string> = {
  cs: 'bg-guesty-100/40 text-guesty-400 ring-guesty-200 hover:bg-guesty-100/60',
  cx: 'bg-navy-50 text-navy-300 ring-navy-100 hover:bg-navy-50/80',
  marketing: 'bg-coral-50 text-coral-300 ring-coral-100 hover:bg-coral-50/80',
  finance: 'bg-guesty-50/40 text-guesty-400 ring-guesty-200 hover:bg-guesty-50/60',
  payments: 'bg-coral-50/60 text-coral-300 ring-coral-100 hover:bg-coral-50/80',
  ob: 'bg-navy-50/60 text-navy-300 ring-navy-100 hover:bg-navy-50/80',
};

const SELECTED_COLORS: Record<string, string> = {
  cs: 'bg-guesty-300 text-white ring-guesty-300',
  cx: 'bg-navy-200 text-white ring-navy-200',
  marketing: 'bg-coral-200 text-white ring-coral-200',
  finance: 'bg-guesty-300 text-white ring-guesty-300',
  payments: 'bg-coral-300 text-white ring-coral-300',
  ob: 'bg-navy-300 text-white ring-navy-300',
};

export default function DepartmentSelector({
  value,
  onChange,
  disabled,
}: DepartmentSelectorProps) {
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.json())
      .then((data: Department[]) => setDepartments(data))
      .catch(() => {});
  }, []);

  if (departments.length === 0) return null;

  if (disabled) {
    const dept = departments.find(d => d.id === value);
    return (
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
          SELECTED_COLORS[value] ?? 'bg-guesty-300 text-white ring-guesty-300'
        }`}>
          {dept?.displayName ?? value}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        Your department
      </label>
      <div className="flex flex-wrap justify-center gap-2">
        {departments.map(dept => {
          const isSelected = dept.id === value;
          return (
            <button
              key={dept.id}
              onClick={() => onChange(dept.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition-all ${
                isSelected
                  ? SELECTED_COLORS[dept.id] ?? 'bg-guesty-300 text-white ring-guesty-300'
                  : DEPT_COLORS[dept.id] ?? 'bg-gray-50 text-gray-600 ring-gray-200 hover:bg-gray-100'
              }`}
            >
              {dept.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
