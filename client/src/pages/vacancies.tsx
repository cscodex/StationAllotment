import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { MapPin } from "lucide-react";
import type { Vacancy } from "@/types";

export default function Vacancies() {
  const { data: vacancies, isLoading } = useQuery({
    queryKey: ["/api/vacancies"],
  });

  const getTotal = (vacancy: Vacancy) => {
    return (vacancy.medicalVacancies || 0) + (vacancy.commerceVacancies || 0) + (vacancy.nonMedicalVacancies || 0);
  };

  const totalVacancies = vacancies?.reduce((sum: number, v: Vacancy) => sum + getTotal(v), 0) || 0;

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Vacancies" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Vacancies" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-primary" />
                District Vacancies
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Vacancies</p>
                <p className="text-2xl font-bold" data-testid="total-vacancies">{totalVacancies}</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>District</TableHead>
                        <TableHead className="text-right">Medical</TableHead>
                        <TableHead className="text-right">Commerce</TableHead>
                        <TableHead className="text-right">Non-Medical</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Distribution</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vacancies?.map((vacancy: Vacancy) => {
                        const total = getTotal(vacancy);
                        const medicalPct = total > 0 ? (vacancy.medicalVacancies / total) * 100 : 0;
                        const commercePct = total > 0 ? (vacancy.commerceVacancies / total) * 100 : 0;
                        const nonMedicalPct = total > 0 ? (vacancy.nonMedicalVacancies / total) * 100 : 0;

                        return (
                          <TableRow key={vacancy.id} data-testid={`vacancy-row-${vacancy.district}`}>
                            <TableCell className="font-medium">{vacancy.district}</TableCell>
                            <TableCell className="text-right">{vacancy.medicalVacancies}</TableCell>
                            <TableCell className="text-right">{vacancy.commerceVacancies}</TableCell>
                            <TableCell className="text-right">{vacancy.nonMedicalVacancies}</TableCell>
                            <TableCell className="text-right font-medium">{total}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center space-x-2 text-xs">
                                  <div className="w-3 h-3 bg-blue-500 rounded" />
                                  <span>Medical: {medicalPct.toFixed(0)}%</span>
                                </div>
                                <div className="flex items-center space-x-2 text-xs">
                                  <div className="w-3 h-3 bg-green-500 rounded" />
                                  <span>Commerce: {commercePct.toFixed(0)}%</span>
                                </div>
                                <div className="flex items-center space-x-2 text-xs">
                                  <div className="w-3 h-3 bg-amber-500 rounded" />
                                  <span>Non-Medical: {nonMedicalPct.toFixed(0)}%</span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {vacancies?.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No vacancy data available. Please upload vacancy file.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
