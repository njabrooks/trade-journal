'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  maxSelections?: number;
  searchable?: boolean;
  showSelectAll?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  disabled = false,
  maxSelections,
  searchable = false,
  showSelectAll = true,
  className,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options;
    const lower = searchQuery.toLowerCase();
    return options.filter(
      opt =>
        opt.label.toLowerCase().includes(lower) ||
        opt.value.toLowerCase().includes(lower) ||
        opt.description?.toLowerCase().includes(lower)
    );
  }, [options, searchQuery]);

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      if (maxSelections && value.length >= maxSelections) return;
      onChange([...value, optionValue]);
    }
  };

  const handleSelectAll = () => {
    if (maxSelections) {
      onChange(options.slice(0, maxSelections).map(o => o.value));
    } else {
      onChange(options.map(o => o.value));
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  // Get display text for trigger
  const getDisplayText = () => {
    if (value.length === 0) return placeholder;
    if (value.length === options.length) return 'All selected';
    if (value.length === 1) {
      const selected = options.find(o => o.value === value[0]);
      return selected?.label ?? '1 selected';
    }
    return `${value.length} selected`;
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isOpen && 'ring-2 ring-ring ring-offset-2'
        )}
      >
        <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
          {getDisplayText()}
        </span>
        <svg
          className={cn('h-4 w-4 opacity-50 transition-transform', isOpen && 'rotate-180')}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          {/* Search Input */}
          {searchable && (
            <div className="p-2 border-b border-border">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1.5 text-sm border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}

          {/* Quick Actions */}
          {showSelectAll && (
            <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Select All
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No options found
              </div>
            ) : (
              filteredOptions.map(option => {
                const isSelected = value.includes(option.value);
                const isDisabled = !isSelected && !!maxSelections && value.length >= maxSelections;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleToggle(option.value)}
                    disabled={isDisabled}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
                      'hover:bg-accent hover:text-accent-foreground',
                      'focus:bg-accent focus:text-accent-foreground',
                      isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input'
                      )}
                    >
                      {isSelected && (
                        <svg
                          className="h-3 w-3"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div>{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer with count */}
          {maxSelections && (
            <div className="px-2 py-1.5 border-t border-border text-xs text-muted-foreground">
              {value.length} / {maxSelections} selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
