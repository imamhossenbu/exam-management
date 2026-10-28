"use client";

import * as React from "react";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";

/** Feature set shared by every DataTable: sorting, global + column filters, pagination. */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime, basic: sortFn_basic },
  filterFns: { includesString: filterFn_includesString, equalsString: filterFn_equalsString },
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Typed column helper bound to the DataTable feature set. Define columns at module scope. */
export function dataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export type DataTableFilter = {
  columnId: string;
  label: string;
  options: { label: string; value: string }[];
};

type DataTableProps<TData extends RowData> = {
  columns: DataTableColumn<TData>[];
  data: TData[];
  searchPlaceholder?: string;
  filters?: DataTableFilter[];
  pageSize?: number;
  emptyState?: React.ReactNode;
  toolbar?: React.ReactNode;
  getRowId?: (row: TData) => string;
  initialSort?: { id: string; desc: boolean }[];
  caption?: string;
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchPlaceholder = "Search…",
  filters = [],
  pageSize = 10,
  emptyState,
  toolbar,
  getRowId,
  initialSort = [],
  caption,
}: DataTableProps<TData>) {
  const table = useTable(
    {
      features: dataTableFeatures,
      columns,
      data,
      getRowId: getRowId ? (row) => getRowId(row) : undefined,
      globalFilterFn: "includesString",
      getColumnCanGlobalFilter: (column) => column.id !== "actions",
      initialState: { pagination: { pageIndex: 0, pageSize }, sorting: initialSort },
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      columnFilters: state.columnFilters,
      pagination: state.pagination,
    }),
  );

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: currentSize } = table.state.pagination;
  const hasQuery = Boolean(table.state.globalFilter) || table.state.columnFilters.length > 0;
  const headerGroups = table.getHeaderGroups();

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={String(table.state.globalFilter ?? "")}
              onChange={(e) => table.setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-8"
            />
          </div>
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;
            return (
              <NativeSelect
                key={filter.columnId}
                aria-label={`Filter by ${filter.label}`}
                className="sm:w-44"
                value={String(column.getFilterValue() ?? "")}
                onChange={(e) => column.setFilterValue(e.target.value || undefined)}
              >
                <option value="">All {filter.label.toLowerCase()}</option>
                {filter.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            );
          })}
        </div>
        {toolbar ? <div className="flex flex-wrap gap-2">{toolbar}</div> : null}
      </div>

      {data.length === 0 && emptyState ? (
        emptyState
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {caption ? <caption className="sr-only">{caption}</caption> : null}
              <thead className="border-b bg-muted/40 text-left text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {headerGroups.map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          className="px-4 py-3 font-semibold whitespace-nowrap"
                          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase hover:text-foreground focus-ring"
                            >
                              <table.FlexRender header={header} />
                              {sorted === "asc" ? (
                                <ArrowUp className="size-3" aria-hidden />
                              ) : sorted === "desc" ? (
                                <ArrowDown className="size-3" aria-hidden />
                              ) : (
                                <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                              )}
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className={cn("px-4 py-3.5 align-middle", cell.column.id === "actions" && "w-0 text-right")}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={SearchX}
                title={hasQuery ? "No matching results" : "Nothing here yet"}
                description={hasQuery ? "Try a different search or clear the filters." : undefined}
                className="border-0"
              />
            </div>
          ) : null}
        </div>
      )}

      {data.length > 0 ? (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite">
            {filteredCount === 0
              ? "0 results"
              : `Showing ${pageIndex * currentSize + 1}–${Math.min((pageIndex + 1) * currentSize, filteredCount)} of ${filteredCount}`}
          </p>
          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="Rows per page"
              className="h-8 w-20 text-xs"
              value={currentSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {pageIndex + 1} / {Math.max(1, table.getPageCount())}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
