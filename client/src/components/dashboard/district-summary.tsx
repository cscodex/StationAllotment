import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Link } from "wouter";
import type { Vacancy } from "@/types";

export default function DistrictSummary() {
  const { data: vacancies } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies"],
  });

  const districtTotals = (vacancies || []).reduce((acc: any, curr: Vacancy) => {
    if (!acc[curr.district]) {
      acc[curr.district] = { Medical: 0, Commerce: 0, NonMedical: 0, total: 0 };
    }
    if (curr.stream === 'Medical') acc[curr.district].Medical += (curr.availableSeats || 0);
    else if (curr.stream === 'Commerce') acc[curr.district].Commerce += (curr.availableSeats || 0);
    else if (curr.stream === 'NonMedical') acc[curr.district].NonMedical += (curr.availableSeats || 0);
    acc[curr.district].total += (curr.availableSeats || 0);
    return acc;
  }, {});

  const topDistricts = Object.keys(districtTotals).sort().slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MapPin className="w-5 h-5 mr-2 text-primary" />
          District Vacancy Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {topDistricts.length > 0 ? topDistricts.map(district => (
            <div key={district} className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div>
                <p className="font-medium" data-testid={`district-${district}`}>{district}</p>
                <p className="text-sm text-muted-foreground">
                  Medical: {districtTotals[district].Medical} | Commerce: {districtTotals[district].Commerce} | Non-Medical: {districtTotals[district].NonMedical}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold" data-testid={`total-${district}`}>
                  {districtTotals[district].total}
                </p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">No vacancy data available</p>
          )}
        </div>
        <Link href="/vacancies">
          <Button variant="ghost" className="w-full mt-4 text-primary" data-testid="button-view-all-districts">
            View all districts →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
