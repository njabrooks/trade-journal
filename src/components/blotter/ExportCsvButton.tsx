"use client";

interface CsvColumn<T> {
  key: keyof T;
  label: string;
}

interface ExportCsvButtonProps<T extends Record<string, unknown>> {
  rows: T[];
  columns: CsvColumn<T>[];
  filename?: string;
}

export function ExportCsvButton<T extends Record<string, unknown>>({
  rows,
  columns,
  filename = "blotter.csv",
}: ExportCsvButtonProps<T>) {
  const handleExport = () => {
    if (!rows.length) return;

    const header = columns.map((column) => column.label).join(",");

    const lines = rows.map((row) =>
      columns
        .map((column) => {
          const value = row[column.key];
          if (value === null || value === undefined) return "";
          const sanitized = String(value).replace(/"/g, '""');
          return `"${sanitized}"`;
        })
        .join(",")
    );

    const csvData = [header, ...lines].join("\n");
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={!rows.length}
      className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Export CSV
    </button>
  );
}

