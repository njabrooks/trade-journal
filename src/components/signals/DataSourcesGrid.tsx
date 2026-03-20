"use client";

import { useState, useMemo } from "react";
import { DataSourceCard, type DataSourceRow, type DataSourceCategory } from "./DataSourceCard";

const CATEGORIES: { label: string; value: DataSourceCategory | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Price", value: "price" },
  { label: "Fundamental", value: "fundamental" },
  { label: "Economic", value: "economic" },
  { label: "Qualitative", value: "qualitative" },
  { label: "Derived", value: "derived" },
  { label: "Internal", value: "internal" },
];

export function DataSourcesGrid({ sources }: { sources: DataSourceRow[] }) {
  const [selectedCategory, setSelectedCategory] = useState<DataSourceCategory | "all">("all");

  const filtered = useMemo(() => {
    if (selectedCategory === "all") return sources;
    return sources.filter((s) => s.category === selectedCategory);
  }, [sources, selectedCategory]);

  return (
    <div className="space-y-4">
      {/* Category filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.value;
          const count = cat.value === "all"
            ? sources.length
            : sources.filter((s) => s.category === cat.value).length;
          if (cat.value !== "all" && count === 0) return null;

          return (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat.label}
              <span className={`text-xs ${isActive ? "text-primary-foreground/70" : "text-muted-foreground/70"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((source) => (
          <DataSourceCard key={source.id} source={source} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No data sources found for this category.
        </div>
      )}
    </div>
  );
}
