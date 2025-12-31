'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ExistingEntityListProps<T> {
  entityType: 'macroThesis' | 'assetThesis' | 'strategy';
  onSelect: (entityId: string) => Promise<void>;
  onCancel: () => void;
  filterParams?: Record<string, string>;
  renderItem: (item: T) => React.ReactNode;
}

export function ExistingEntityList<T extends { id: string; title?: string; label?: string }>({
  entityType,
  onSelect,
  onCancel,
  filterParams = {},
  renderItem,
}: ExistingEntityListProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);

    try {
      let url = '';
      switch (entityType) {
        case 'macroThesis':
          url = '/api/theses';
          break;
        case 'assetThesis':
          url = '/api/asset-theses';
          break;
        case 'strategy':
          url = '/api/strategies';
          break;
      }

      // Add filter params
      const params = new URLSearchParams(filterParams);
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${entityType}s`);
      
      const data = await response.json();
      
      // Handle different API response formats
      if (entityType === 'strategy' && data.strategies) {
        setItems(data.strategies);
      } else if (Array.isArray(data)) {
        setItems(data);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error(`Error fetching ${entityType}s:`, err);
      setError(err instanceof Error ? err.message : `Failed to load ${entityType}s`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (entityId: string) => {
    setSelecting(entityId);
    setError(null);

    try {
      await onSelect(entityId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link');
      setSelecting(null);
    }
  };

  const filteredItems = searchQuery
    ? items.filter((item) => {
        const searchText = (item.title || item.label || '').toLowerCase();
        return searchText.includes(searchQuery.toLowerCase());
      })
    : items;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error && !selecting) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          {searchQuery ? 'No matching items found' : 'No items available'}
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                {renderItem(item)}
              </div>
              <Button
                size="sm"
                onClick={() => handleSelect(item.id)}
                disabled={selecting !== null}
                className="ml-3 shrink-0"
              >
                {selecting === item.id ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Linking...
                  </>
                ) : (
                  'Select'
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={selecting !== null}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

