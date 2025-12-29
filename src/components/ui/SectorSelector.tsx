'use client';

/**
 * Sector Selector Component
 *
 * Multi-select dropdown for choosing sectors/topics from the taxonomy.
 * Used in Macro Thesis creation/editing forms.
 *
 * Part of Phase 2.6.4: Schema & Taxonomy Improvements
 */

import { useState, useMemo } from 'react';
import { TAXONOMY_CATEGORIES, type TaxonomyItem } from '@/lib/constants/sector-taxonomy';

interface SectorSelectorProps {
  value: string[];
  onChange: (sectors: string[]) => void;
  placeholder?: string;
  maxSelections?: number;
  disabled?: boolean;
}

export function SectorSelector({
  value = [],
  onChange,
  placeholder = 'Select sectors/topics...',
  maxSelections,
  disabled = false,
}: SectorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filter items based on search query and selected category
  const filteredItems = useMemo(() => {
    let items: TaxonomyItem[] = [];

    if (selectedCategory) {
      const category = TAXONOMY_CATEGORIES.find(cat => cat.id === selectedCategory);
      items = category?.items ?? [];
    } else {
      items = TAXONOMY_CATEGORIES.flatMap(cat => cat.items);
    }

    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      items = items.filter(
        item =>
          item.label.toLowerCase().includes(lower) ||
          item.value.toLowerCase().includes(lower) ||
          item.description?.toLowerCase().includes(lower)
      );
    }

    return items;
  }, [searchQuery, selectedCategory]);

  const handleToggleItem = (itemValue: string) => {
    if (value.includes(itemValue)) {
      onChange(value.filter(v => v !== itemValue));
    } else {
      if (maxSelections && value.length >= maxSelections) {
        return; // Don't add if max selections reached
      }
      onChange([...value, itemValue]);
    }
  };

  const handleRemoveItem = (itemValue: string) => {
    onChange(value.filter(v => v !== itemValue));
  };

  return (
    <div className="relative">
      {/* Selected Items Display */}
      <div className="min-h-[42px] p-2 border border-slate-300 rounded-lg bg-white">
        {value.length === 0 ? (
          <span className="text-sm text-slate-400">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {value.map(itemValue => (
              <span
                key={itemValue}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-md"
              >
                {itemValue}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(itemValue)}
                    className="hover:text-blue-900"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dropdown Button */}
      {!disabled && (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="mt-2 px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          {isOpen ? 'Close' : 'Add Sectors/Topics'}
        </button>
      )}

      {/* Dropdown Panel */}
      {isOpen && !disabled && (
        <div className="absolute z-10 mt-2 w-full max-w-2xl bg-white border border-slate-300 rounded-lg shadow-lg">
          {/* Search */}
          <div className="p-3 border-b border-slate-200">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search taxonomy..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 p-3 border-b border-slate-200 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                selectedCategory === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            {TAXONOMY_CATEGORIES.map(category => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* Items List */}
          <div className="max-h-[300px] overflow-y-auto p-3">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No items found</p>
            ) : (
              <div className="space-y-1">
                {filteredItems.map(item => {
                  const isSelected = value.includes(item.value);
                  const isDisabled = Boolean(
                    !isSelected && maxSelections && value.length >= maxSelections
                  );

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => handleToggleItem(item.value)}
                      disabled={isDisabled}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                        isSelected
                          ? 'bg-blue-50 border border-blue-200'
                          : isDisabled
                          ? 'text-slate-400 cursor-not-allowed'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{item.label}</div>
                          {item.description && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {item.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <svg
                            className="w-4 h-4 text-blue-600"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {maxSelections && (
            <div className="p-3 border-t border-slate-200 text-xs text-slate-500">
              {value.length} / {maxSelections} selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
