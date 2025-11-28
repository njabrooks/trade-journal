"use client";

import { useState, useEffect } from "react";

export interface Criterion {
  pattern: string;
  operator: string;
  value: string | number | boolean;
}

export interface CriteriaBuilderProps {
  value: string; // The text criteria string
  onChange: (criteriaText: string) => void;
}

const CRITERIA_PATTERNS = {
  MaxDTE: {
    label: "MaxDTE",
    operators: [">", ">=", "<", "<=", "="],
    valueType: "number" as const,
    placeholder: "e.g., 90",
  },
  PnlPctOfCost: {
    label: "PnlPctOfCost",
    operators: [">", ">=", "<", "<=", "="],
    valueType: "number" as const,
    placeholder: "e.g., 0.3",
  },
  WorstShortSigma: {
    label: "WorstShortSigma",
    operators: [">", ">=", "<", "<=", "="],
    valueType: "number" as const,
    placeholder: "e.g., 0.5",
  },
  AssignmentRisk: {
    label: "AssignmentRisk",
    operators: ["=", "≠"],
    valueType: "boolean" as const,
    placeholder: "Yes/No",
  },
  ITM: {
    label: "ITM (Legs In The Money)",
    operators: ["="],
    valueType: "boolean" as const,
    placeholder: "True/False",
  },
  Exclusion: {
    label: "Exclusion (not state codes)",
    operators: ["not"],
    valueType: "statecodes" as const,
    placeholder: "e.g., LC2/LC3/LC4",
  },
} as const;

type PatternKey = keyof typeof CRITERIA_PATTERNS;

export function CriteriaBuilder({ value, onChange }: CriteriaBuilderProps) {
  const [criteria, setCriteria] = useState<Array<Criterion & { id: string; connector?: "AND" | "OR" }>>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Parse existing criteria text into structured format
  useEffect(() => {
    if (value && value.trim()) {
      try {
        const parsed = parseCriteriaText(value);
        setCriteria(parsed);
        setParseError(null);
        // If parsing resulted in empty array but we have text, it might be unparseable
        if (parsed.length === 0 && value.trim().length > 0) {
          setParseError("Could not parse criteria. You may need to rebuild it manually.");
        }
      } catch (error) {
        // If parsing fails, start with empty criteria but show error
        setCriteria([]);
        setParseError(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      setCriteria([]);
      setParseError(null);
    }
  }, [value]);

  // Convert structured criteria to text format
  const updateCriteriaText = (newCriteria: typeof criteria) => {
    if (newCriteria.length === 0) {
      onChange("");
      return;
    }

    const parts: string[] = [];
    for (let i = 0; i < newCriteria.length; i++) {
      const criterion = newCriteria[i];
      if (i > 0 && criterion.connector) {
        parts.push(criterion.connector);
      }

      const pattern = CRITERIA_PATTERNS[criterion.pattern as PatternKey];
      if (!pattern) continue;

      if (criterion.pattern === "Exclusion") {
        parts.push(`not ${criterion.value}`);
      } else if (criterion.pattern === "AssignmentRisk" || criterion.pattern === "ITM") {
        const boolValue = criterion.value === true || criterion.value === "Yes" || criterion.value === "True";
        if (criterion.operator === "=") {
          parts.push(`${criterion.pattern} = ${boolValue ? "Yes" : "No"}`);
        } else if (criterion.operator === "≠") {
          parts.push(`${criterion.pattern} ≠ ${boolValue ? "Yes" : "No"}`);
        }
      } else {
        parts.push(`${criterion.pattern} ${criterion.operator} ${criterion.value}`);
      }
    }

    onChange(parts.join(" "));
  };

  const addCriterion = () => {
    const newCriterion: Criterion & { id: string; connector?: "AND" | "OR" } = {
      id: `criterion-${Date.now()}`,
      pattern: "MaxDTE",
      operator: ">",
      value: "",
      connector: criteria.length > 0 ? "AND" : undefined,
    };
    const updated = [...criteria, newCriterion];
    setCriteria(updated);
    updateCriteriaText(updated);
  };

  const removeCriterion = (id: string) => {
    const updated = criteria.filter((c) => c.id !== id);
    // Remove connector from first remaining item
    if (updated.length > 0 && updated[0].connector) {
      updated[0].connector = undefined;
    }
    setCriteria(updated);
    updateCriteriaText(updated);
  };

  const updateCriterion = (
    id: string,
    field: keyof Criterion | "connector",
    newValue: string | number | boolean | "AND" | "OR"
  ) => {
    const updated = criteria.map((c) => {
      if (c.id === id) {
        if (field === "connector") {
          return { ...c, connector: newValue as "AND" | "OR" };
        }
        // Reset operator and value when pattern changes
        if (field === "pattern") {
          const pattern = CRITERIA_PATTERNS[newValue as PatternKey];
          const defaultOperator = pattern.operators[0];
          let defaultValue: string | number | boolean = "";
          if (pattern.valueType === "boolean") {
            defaultValue = true;
          } else if (pattern.valueType === "number") {
            defaultValue = 0;
          }
          return {
            ...c,
            pattern: newValue as string,
            operator: defaultOperator,
            value: defaultValue,
          };
        }
        return { ...c, [field]: newValue };
      }
      return c;
    });
    setCriteria(updated);
    updateCriteriaText(updated);
  };

  const getPatternConfig = (patternKey: string) => {
    return CRITERIA_PATTERNS[patternKey as PatternKey];
  };

  return (
    <div className="space-y-3">
      {parseError && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          <strong>Warning:</strong> {parseError}
          <br />
          <span className="text-amber-600">Original criteria: "{value}"</span>
        </div>
      )}
      {criteria.length === 0 && !parseError && (
        <p className="text-sm text-gray-500 italic">No criteria defined. Click "Add Criterion" to add one.</p>
      )}

      {criteria.map((criterion, index) => {
        const patternConfig = getPatternConfig(criterion.pattern);
        if (!patternConfig) return null;

        return (
          <div key={criterion.id} className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-gray-50">
            {index > 0 && (
              <select
                value={criterion.connector || "AND"}
                onChange={(e) => updateCriterion(criterion.id, "connector", e.target.value as "AND" | "OR")}
                className="border rounded px-2 py-1 text-sm font-medium"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            )}

            <select
              value={criterion.pattern}
              onChange={(e) => updateCriterion(criterion.id, "pattern", e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              {Object.entries(CRITERIA_PATTERNS).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>

            <select
              value={criterion.operator}
              onChange={(e) => updateCriterion(criterion.id, "operator", e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {patternConfig.operators.map((op) => (
                <option key={op} value={op}>
                  {op === "≠" ? "≠" : op}
                </option>
              ))}
            </select>

            {patternConfig.valueType === "boolean" ? (
              <select
                value={criterion.value === true || criterion.value === "Yes" || criterion.value === "True" ? "Yes" : "No"}
                onChange={(e) => updateCriterion(criterion.id, "value", e.target.value === "Yes")}
                className="border rounded px-3 py-1 text-sm"
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            ) : patternConfig.valueType === "statecodes" ? (
              <input
                type="text"
                value={criterion.value as string}
                onChange={(e) => updateCriterion(criterion.id, "value", e.target.value)}
                placeholder={patternConfig.placeholder}
                className="border rounded px-3 py-1 text-sm w-48"
              />
            ) : (
              <input
                type="number"
                step={criterion.pattern === "PnlPctOfCost" ? "0.01" : "1"}
                value={criterion.value}
                onChange={(e) => {
                  const numValue = criterion.pattern === "PnlPctOfCost" ? parseFloat(e.target.value) : parseInt(e.target.value);
                  updateCriterion(criterion.id, "value", isNaN(numValue) ? 0 : numValue);
                }}
                placeholder={patternConfig.placeholder}
                className="border rounded px-3 py-1 text-sm w-32"
              />
            )}

            <button
              type="button"
              onClick={() => removeCriterion(criterion.id)}
              className="text-red-600 hover:text-red-800 text-sm px-2"
            >
              Remove
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addCriterion}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        + Add Criterion
      </button>

      {criteria.length > 0 && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
          <strong>Generated criteria:</strong> {value || "(empty)"}
        </div>
      )}
    </div>
  );
}

// Parse criteria text back into structured format
function parseCriteriaText(text: string): Array<Criterion & { id: string; connector?: "AND" | "OR" }> {
  const criteria: Array<Criterion & { id: string; connector?: "AND" | "OR" }> = [];
  
  // Remove comments in parentheses (e.g., "(100%+ gain)", "(moderate loser)")
  let cleanText = text.replace(/\s*\([^)]*\)/g, '').trim();
  
  // Handle parentheses with OR logic - flatten them for now
  // Example: "(WorstShortSigma is blank OR > 1.0σ)" becomes "WorstShortSigma is blank OR > 1.0σ"
  cleanText = cleanText.replace(/\(([^)]+)\)/g, (match, content) => {
    return content.trim();
  });

  // Split by AND/OR, handling both uppercase and lowercase
  const parts: Array<{ text: string; connector?: "AND" | "OR" }> = [];
  const splitPattern = /\s+(AND|OR)\s+/gi;
  let lastIndex = 0;
  let match;
  let lastConnector: "AND" | "OR" | undefined = undefined;

  while ((match = splitPattern.exec(cleanText)) !== null) {
    if (match.index > lastIndex) {
      const partText = cleanText.substring(lastIndex, match.index).trim();
      if (partText) {
        parts.push({ text: partText, connector: lastConnector });
      }
    }
    lastConnector = match[1].toUpperCase() as "AND" | "OR";
    lastIndex = match.index + match[0].length;
  }

  // Add the last part
  if (lastIndex < cleanText.length) {
    const partText = cleanText.substring(lastIndex).trim();
    if (partText) {
      parts.push({ text: partText, connector: lastConnector });
    }
  }

  // If no AND/OR found, treat entire string as one part
  if (parts.length === 0) {
    parts.push({ text: cleanText });
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.text || part.text === "AND" || part.text === "OR") continue;

    // Parse exclusion: "not LC2/LC3/LC4"
    const exclusionMatch = part.text.match(/^not\s+([A-Z0-9\/]+)$/i);
    if (exclusionMatch) {
      criteria.push({
        id: `criterion-${Date.now()}-${i}`,
        pattern: "Exclusion",
        operator: "not",
        value: exclusionMatch[1],
        connector: part.connector,
      });
      continue;
    }

    // Parse boolean patterns: "HasAssignmentRisk = Yes" or "AssignmentRisk ≠ Yes" (with or without quotes)
    const boolMatch = part.text.match(/^(HasAssignmentRisk|AssignmentRisk|ITM)\s*([=≠])\s*["']?(Yes|No|True|False)["']?$/i);
    if (boolMatch) {
      criteria.push({
        id: `criterion-${Date.now()}-${i}`,
        pattern: boolMatch[1] === "HasAssignmentRisk" ? "AssignmentRisk" : boolMatch[1],
        operator: boolMatch[2] === "≠" ? "≠" : "=",
        value: boolMatch[3] === "Yes" || boolMatch[3] === "True",
        connector: part.connector,
      });
      continue;
    }

    // Parse range patterns: "0.3 < PnlPctOfCost ≤ 1.0" or "-0.2 ≤ PnlPctOfCost ≤ 0.3" or "0.5σ < WorstShortSigma ≤ 1.0σ"
    const rangeMatch = part.text.match(/^([-\d.]+)σ?\s*([<>≤≥=]+)\s*(MaxDTE|PnlPctOfCost|WorstShortSigma)\s*([<>≤≥=]+)\s*([-\d.]+)σ?/i);
    if (rangeMatch) {
      // Convert range to two separate criteria
      const lowerBound = parseFloat(rangeMatch[1]);
      const upperBound = parseFloat(rangeMatch[5]);
      const pattern = rangeMatch[3];
      const lowerOp = rangeMatch[2].replace("≤", "<=").replace("≥", ">=");
      const upperOp = rangeMatch[4].replace("≤", "<=").replace("≥", ">=");
      
      criteria.push({
        id: `criterion-${Date.now()}-${i}-lower`,
        pattern,
        operator: lowerOp === "<" ? ">" : ">=",
        value: lowerBound,
        connector: part.connector,
      });
      
      criteria.push({
        id: `criterion-${Date.now()}-${i}-upper`,
        pattern,
        operator: upperOp === "≤" ? "<=" : "<",
        value: upperBound,
        connector: "AND",
      });
      continue;
    }

    // Parse numeric patterns: "MaxDTE > 90" or "PnlPctOfCost <= 0.3" or "WorstShortSigma ≤ 0.5σ"
    // Handle negative numbers and σ symbols
    const numericMatch = part.text.match(/^(MaxDTE|PnlPctOfCost|WorstShortSigma)\s*([><=≤≥]+)\s*([-\d.]+)σ?/i);
    if (numericMatch) {
      const operator = numericMatch[2].replace("≤", "<=").replace("≥", ">=");
      criteria.push({
        id: `criterion-${Date.now()}-${i}`,
        pattern: numericMatch[1],
        operator,
        value: parseFloat(numericMatch[3]),
        connector: part.connector,
      });
      continue;
    }

    // Parse standalone comparisons like "> 1.0σ" (assumes WorstShortSigma from context)
    // This handles cases like "(WorstShortSigma is blank OR > 1.0σ)"
    const standaloneMatch = part.text.match(/^([<>≤≥=]+)\s*([-\d.]+)σ?$/i);
    if (standaloneMatch) {
      // Try to infer pattern from previous criteria or default to WorstShortSigma
      const inferredPattern = criteria.length > 0 && criteria[criteria.length - 1].pattern === "WorstShortSigma" 
        ? "WorstShortSigma" 
        : "WorstShortSigma"; // Default assumption for standalone comparisons
      const operator = standaloneMatch[1].replace("≤", "<=").replace("≥", ">=");
      criteria.push({
        id: `criterion-${Date.now()}-${i}`,
        pattern: inferredPattern,
        operator,
        value: parseFloat(standaloneMatch[2]),
        connector: part.connector,
      });
      continue;
    }

    // Parse "is blank" patterns: "WorstShortSigma is blank"
    // For now, we'll skip these as they're not easily representable
    // Could add a "is null" pattern later if needed
    const blankMatch = part.text.match(/^(WorstShortSigma|MaxDTE|PnlPctOfCost)\s+is\s+blank$/i);
    if (blankMatch) {
      // Skip for now - could add special handling later
      continue;
    }
  }

  return criteria;
}

