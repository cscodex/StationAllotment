import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Link } from "wouter";
import type { Vacancy } from "@/types";

export default function DistrictSummary() {
  const { data: vacancies } = useQuery({
    queryKey: ["/api/vacancies"],
  });

  const getTotal = (vacancy: Vacancy) => {
    return (vacancy.medicalVacancies || 0) + (vacancy.commerceVacancies || 0) + (vacancy.nonMedicalVacancies || 0);
  };

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
          {vacancies?.slice(0, 3).map((vacancy: Vacancy) => (
            <div key={vacancy.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div>
                <p className="font-medium" data-testid={`district-${vacancy.district}`}>{vacancy.district}</p>
                <p className="text-sm text-muted-foreground">
                  Medical: {vacancy.medicalVacancies} | Commerce: {vacancy.commerceVacancies} | Non-Medical: {vacancy.nonMedicalVacancies}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold" data-testid={`total-${vacancy.district}`}>
                  {getTotal(vacancy)}
                </p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          )) || (
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
