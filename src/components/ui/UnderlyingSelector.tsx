'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface Underlying {
  id: string;
  ticker: string;
  name: string | null;
}

interface UnderlyingSelectorProps {
  value: string; // The ticker value
  onChange: (ticker: string) => void;
  initialTicker?: string; // Pre-select/fill this ticker if provided
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/**
 * Unified underlying/ticker selector component.
 *
 * Shows a dropdown of existing underlyings with an option to add a new ticker.
 * When "Add new ticker..." is selected, shows a text input for the new ticker.
 *
 * If initialTicker is provided:
 * - If it matches an existing underlying, that underlying is pre-selected
 * - If it doesn't match, the custom input mode is activated with the ticker pre-filled
 */
export function UnderlyingSelector({
  value,
  onChange,
  initialTicker,
  disabled = false,
  required = false,
  className = '',
}: UnderlyingSelectorProps) {
  const [underlyings, setUnderlyings] = useState<Underlying[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customTicker, setCustomTicker] = useState('');
  const [selectedUnderlyingId, setSelectedUnderlyingId] = useState<string>('');

  // Fetch underlyings on mount
  useEffect(() => {
    const fetchUnderlyings = async () => {
      try {
        const response = await fetch('/api/underlyings');
        if (!response.ok) throw new Error('Failed to fetch underlyings');
        const data = await response.json();
        setUnderlyings(data || []);
      } catch (err) {
        console.error('Error fetching underlyings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUnderlyings();
  }, []);

  // Handle initialTicker once underlyings are loaded
  useEffect(() => {
    if (loading || !initialTicker) return;

    const normalizedInitial = initialTicker.toUpperCase();
    const matchingUnderlying = underlyings.find(
      (u) => u.ticker.toUpperCase() === normalizedInitial
    );

    if (matchingUnderlying) {
      // Pre-select the matching underlying
      setSelectedUnderlyingId(matchingUnderlying.id);
      setIsCustomMode(false);
      onChange(matchingUnderlying.ticker);
    } else {
      // Switch to custom mode with the ticker pre-filled
      setIsCustomMode(true);
      setCustomTicker(normalizedInitial);
      onChange(normalizedInitial);
    }
  }, [loading, initialTicker, underlyings]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;

    if (selectedValue === '__new__') {
      setIsCustomMode(true);
      setSelectedUnderlyingId('');
      setCustomTicker('');
      onChange('');
    } else {
      const underlying = underlyings.find((u) => u.id === selectedValue);
      if (underlying) {
        setSelectedUnderlyingId(underlying.id);
        onChange(underlying.ticker);
      } else {
        setSelectedUnderlyingId('');
        onChange('');
      }
    }
  };

  const handleCustomTickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ticker = e.target.value.toUpperCase();
    setCustomTicker(ticker);
    onChange(ticker);
  };

  const handleCancelCustom = () => {
    setIsCustomMode(false);
    setCustomTicker('');
    // Reset to previously selected underlying or empty
    if (selectedUnderlyingId) {
      const underlying = underlyings.find((u) => u.id === selectedUnderlyingId);
      if (underlying) {
        onChange(underlying.ticker);
      }
    } else {
      onChange('');
    }
  };

  if (isCustomMode) {
    return (
      <div className={`flex gap-2 ${className}`}>
        <input
          type="text"
          value={customTicker}
          onChange={handleCustomTickerChange}
          placeholder="Enter ticker (e.g., AAPL)"
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={disabled}
          required={required}
          autoFocus
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCancelCustom}
          disabled={disabled}
          className="px-3"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <select
      value={selectedUnderlyingId}
      onChange={handleDropdownChange}
      className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      disabled={disabled || loading}
      required={required}
    >
      <option value="">
        {loading ? 'Loading underlyings...' : '-- Select an underlying --'}
      </option>
      {underlyings.map((underlying) => (
        <option key={underlying.id} value={underlying.id}>
          {underlying.ticker}
          {underlying.name ? ` - ${underlying.name}` : ''}
        </option>
      ))}
      <option value="__new__">+ Add new ticker...</option>
    </select>
  );
}
