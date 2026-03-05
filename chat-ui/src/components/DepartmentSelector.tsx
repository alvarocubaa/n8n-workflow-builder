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

  return (
    <div className="flex flex-col items-center gap-1">
      <label
        htmlFor="department-select"
        className="text-xs font-medium text-gray-500 uppercase tracking-wide"
      >
        Department
      </label>
      <select
        id="department-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700
                   shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {departments.map(dept => (
          <option key={dept.id} value={dept.id}>
            {dept.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
