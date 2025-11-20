import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AcademicYearSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  className?: string;
  showLabel?: boolean;
}

export function AcademicYearSelector({
  value,
  onValueChange,
  className,
  showLabel = true,
}: AcademicYearSelectorProps) {
  // Generate academic years (current year ± 2 years)
  const currentYear = new Date().getFullYear();
  const academicYears: string[] = [];
  
  for (let i = -2; i <= 2; i++) {
    const year = currentYear + i;
    academicYears.push(`${year}-${year + 1}`);
  }

  // Get unique academic years from counseling rounds
  const { data: rounds } = useQuery({
    queryKey: ["/api/counseling-rounds"],
    enabled: false, // Don't auto-fetch, just for type
  });

  // Extract unique academic years from rounds if available
  const yearsFromRounds = rounds
    ? Array.from(new Set((rounds as any[]).map((r: any) => r.academicYear))).sort().reverse()
    : [];

  // Combine and deduplicate
  const allYears = Array.from(new Set([...academicYears, ...yearsFromRounds])).sort().reverse();

  // Set default to current academic year if no value
  useEffect(() => {
    if (!value && allYears.length > 0) {
      const currentAcademicYear = `${currentYear}-${currentYear + 1}`;
      if (allYears.includes(currentAcademicYear)) {
        onValueChange(currentAcademicYear);
      } else {
        onValueChange(allYears[0]);
      }
    }
  }, [value, allYears, currentYear, onValueChange]);

  return (
    <div className={className}>
      {showLabel && (
        <label className="text-sm font-medium mb-2 block">Academic Year</label>
      )}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <Calendar className="w-4 h-4 mr-2" />
          <SelectValue placeholder="Select academic year" />
        </SelectTrigger>
        <SelectContent>
          {allYears.map((year) => (
            <SelectItem key={year} value={year}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}


