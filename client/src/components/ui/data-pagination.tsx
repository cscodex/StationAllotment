import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis
} from "@/components/ui/pagination";

interface DataPaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  showItemsPerPageSelector?: boolean;
  itemsPerPageOptions?: number[];
  showPageNumbers?: boolean;
}

export function DataPagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  showItemsPerPageSelector = true,
  itemsPerPageOptions = [10, 25, 50, 100],
  showPageNumbers = true
}: DataPaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = currentPage * itemsPerPage + 1;
  const endItem = Math.min((currentPage + 1) * itemsPerPage, totalItems);

  const canGoPrevious = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  const getVisiblePages = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];

    for (let i = Math.max(0, currentPage - delta); 
         i <= Math.min(totalPages - 1, currentPage + delta); 
         i++) {
      range.push(i);
    }

    if (range[0] > 1) {
      rangeWithDots.push(0);
      if (range[0] > 2) {
        rangeWithDots.push(-1);
      }
    } else if (range[0] === 1) {
      rangeWithDots.push(0);
    }

    rangeWithDots.push(...range);

    if (range[range.length - 1] < totalPages - 2) {
      rangeWithDots.push(-1);
      rangeWithDots.push(totalPages - 1);
    } else if (range[range.length - 1] === totalPages - 2) {
      rangeWithDots.push(totalPages - 1);
    }

    return rangeWithDots;
  };

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between space-x-6 lg:space-x-8 py-4" data-testid="data-pagination">
      <div className="flex items-center space-x-2">
        <p className="text-sm text-muted-foreground" data-testid="pagination-info">
          Showing {startItem}-{endItem} of {totalItems}
        </p>
        {showItemsPerPageSelector && onItemsPerPageChange && (
          <div className="flex items-center space-x-2">
            <p className="text-sm text-muted-foreground">per page</p>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => onItemsPerPageChange(parseInt(value))}
            >
              <SelectTrigger className="h-8 w-[70px]" data-testid="select-items-per-page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                {itemsPerPageOptions.map((pageSize) => (
                  <SelectItem key={pageSize} value={pageSize.toString()}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              onClick={() => canGoPrevious && onPageChange(currentPage - 1)}
              className={canGoPrevious ? "cursor-pointer" : "cursor-not-allowed opacity-50"}
              data-testid="button-previous-page"
            />
          </PaginationItem>

          {showPageNumbers && getVisiblePages().map((page, index) => (
            page === -1 ? (
              <PaginationItem key={`dots-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={page}>
                <PaginationLink
                  onClick={() => onPageChange(page)}
                  isActive={page === currentPage}
                  className="cursor-pointer"
                  data-testid={`button-page-${page + 1}`}
                >
                  {page + 1}
                </PaginationLink>
              </PaginationItem>
            )
          ))}

          <PaginationItem>
            <PaginationNext 
              onClick={() => canGoNext && onPageChange(currentPage + 1)}
              className={canGoNext ? "cursor-pointer" : "cursor-not-allowed opacity-50"}
              data-testid="button-next-page"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}