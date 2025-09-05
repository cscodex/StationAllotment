import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Users, TrendingUp, Clock, Filter, Eye, TableIcon } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISTRICTS, STREAMS, getCategoriesForGender } from "@shared/schema";
import type { Vacancy } from "@shared/schema";

export default function Vacancies() {
  const [selectedStream, setSelectedStream] = useState<string>("all");
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<string>("table"); // 'table' | 'summary'

  const { data: vacancies } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies"],
  });

  // Filter vacancies based on selected filters
  const filteredVacancies = vacancies?.filter(vacancy => {
    if (selectedStream !== "all" && vacancy.stream !== selectedStream) return false;
    if (selectedGender !== "all" && vacancy.gender !== selectedGender) return false;
    if (selectedDistrict !== "all" && vacancy.district !== selectedDistrict) return false;
    if (selectedCategory !== "all" && vacancy.category !== selectedCategory) return false;
    return true;
  }) || [];

  // Group vacancies by district for district-wise summary
  const districtSummary = filteredVacancies.reduce((acc, vacancy) => {
    const district = vacancy.district;
    if (!acc[district]) {
      acc[district] = {
        district,
        totalSeats: 0,
        availableSeats: 0,
        genderBreakdown: {},
        streamBreakdown: {},
        categories: {}
      };
    }
    
    acc[district].totalSeats += vacancy.totalSeats || 0;
    acc[district].availableSeats += vacancy.availableSeats || 0;
    
    // Gender breakdown
    const gender = vacancy.gender;
    if (!acc[district].genderBreakdown[gender]) {
      acc[district].genderBreakdown[gender] = { total: 0, available: 0 };
    }
    acc[district].genderBreakdown[gender].total += vacancy.totalSeats || 0;
    acc[district].genderBreakdown[gender].available += vacancy.availableSeats || 0;
    
    // Stream breakdown
    const stream = vacancy.stream;
    if (!acc[district].streamBreakdown[stream]) {
      acc[district].streamBreakdown[stream] = { total: 0, available: 0 };
    }
    acc[district].streamBreakdown[stream].total += vacancy.totalSeats || 0;
    acc[district].streamBreakdown[stream].available += vacancy.availableSeats || 0;
    
    // Category breakdown
    const category = vacancy.category;
    if (!acc[district].categories[category]) {
      acc[district].categories[category] = { total: 0, available: 0 };
    }
    acc[district].categories[category].total += vacancy.totalSeats || 0;
    acc[district].categories[category].available += vacancy.availableSeats || 0;
    
    return acc;
  }, {} as Record<string, any>);

  const districts = Object.values(districtSummary);
  const totalSeats = districts.reduce((sum, d) => sum + d.totalSeats, 0);
  const totalAvailable = districts.reduce((sum, d) => sum + d.availableSeats, 0);
  const totalDistricts = districts.length;

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="District Vacancies" 
        breadcrumbs={[
          { name: "Home" },
          { name: "Vacancies" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Filter className="w-5 h-5 mr-2 text-primary" />
                Filters & View Options
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">District:</label>
                  <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                    <SelectTrigger className="w-40" data-testid="filter-district">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Districts</SelectItem>
                      {DISTRICTS.map(district => (
                        <SelectItem key={district} value={district}>{district}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Stream:</label>
                  <Select value={selectedStream} onValueChange={setSelectedStream}>
                    <SelectTrigger className="w-40" data-testid="filter-stream">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Streams</SelectItem>
                      {STREAMS.map(stream => (
                        <SelectItem key={stream} value={stream}>{stream}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Gender:</label>
                  <Select value={selectedGender} onValueChange={setSelectedGender}>
                    <SelectTrigger className="w-32" data-testid="filter-gender">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Category:</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-32" data-testid="filter-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="WHH">WHH</SelectItem>
                      <SelectItem value="Private">Private</SelectItem>
                      <SelectItem value="Disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  variant={viewMode === "table" ? "default" : "outline"}
                  onClick={() => setViewMode(viewMode === "table" ? "summary" : "table")}
                  data-testid="toggle-view-mode"
                >
                  <TableIcon className="w-4 h-4 mr-2" />
                  {viewMode === "table" ? "Summary View" : "Table View"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">Districts</span>
                </div>
                <div className="text-2xl font-bold text-primary mt-2" data-testid="total-districts">
                  {totalDistricts}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-muted-foreground">Total Seats</span>
                </div>
                <div className="text-2xl font-bold text-blue-600 mt-2" data-testid="total-seats">
                  {totalSeats.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-muted-foreground">Available</span>
                </div>
                <div className="text-2xl font-bold text-green-600 mt-2" data-testid="available-seats">
                  {totalAvailable.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-orange-600" />
                  <span className="text-sm font-medium text-muted-foreground">Fill Rate</span>
                </div>
                <div className="text-2xl font-bold text-orange-600 mt-2" data-testid="fill-rate">
                  {totalSeats ? Math.round(((totalSeats - totalAvailable) / totalSeats) * 100) : 0}%
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Vacancy Data Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building2 className="w-5 h-5 mr-2 text-primary" />
                {viewMode === "table" ? "Vacancy Records" : "District-wise Vacancy Summary"}
                {(selectedStream !== "all" || selectedGender !== "all" || selectedDistrict !== "all" || selectedCategory !== "all") && (
                  <Badge variant="secondary" className="ml-2">
                    Filtered ({filteredVacancies.length} records)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {viewMode === "table" ? (
                // Individual Vacancy Records Table
                filteredVacancies && filteredVacancies.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>District</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Stream</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-center">Total Seats</TableHead>
                          <TableHead className="text-center">Available Seats</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredVacancies.map((vacancy) => (
                          <TableRow key={vacancy.id} data-testid={`vacancy-record-${vacancy.id}`}>
                            <TableCell className="font-medium">{vacancy.district}</TableCell>
                            <TableCell>
                              <Badge variant={vacancy.gender === 'Male' ? 'default' : 'secondary'}>
                                {vacancy.gender}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={vacancy.stream === 'Medical' ? 'default' : vacancy.stream === 'Commerce' ? 'secondary' : 'outline'}>
                                {vacancy.stream}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={vacancy.category === 'Open' ? 'default' : 'secondary'}>
                                {vacancy.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                {vacancy.totalSeats || 0}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="bg-green-50 text-green-700">
                                {vacancy.availableSeats || 0}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <TableIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No vacancy records found</p>
                    <p className="text-sm">Upload vacancy data or adjust filters to see individual records</p>
                  </div>
                )
              ) : (
                // District Summary View (existing)
                districts && districts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">District</th>
                          <th className="text-center py-3 px-4 font-medium text-muted-foreground">Total Seats</th>
                          <th className="text-center py-3 px-4 font-medium text-muted-foreground">Available</th>
                          <th className="text-center py-3 px-4 font-medium text-muted-foreground">Allocated</th>
                          <th className="text-center py-3 px-4 font-medium text-muted-foreground">Fill %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {districts.map((district) => {
                          const allocated = district.totalSeats - district.availableSeats;
                          const fillRate = district.totalSeats ? Math.round((allocated / district.totalSeats) * 100) : 0;
                          
                          return (
                            <tr key={district.district} className="border-b border-border/50 hover:bg-muted/50" 
                                data-testid={`vacancy-summary-${district.district.replace(/\s+/g, '-').toLowerCase()}`}>
                              <td className="py-3 px-4 font-medium">{district.district}</td>
                              <td className="py-3 px-4 text-center">
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  {district.totalSeats}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  {district.availableSeats}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                  {allocated}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Badge variant="default" className={`${fillRate >= 80 ? 'bg-red-100 text-red-700' : fillRate >= 60 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                  {fillRate}%
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                        
                        {/* Totals Row */}
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td className="py-3 px-4 font-bold text-primary">TOTAL</td>
                          <td className="py-3 px-4 text-center font-bold text-blue-700">{totalSeats}</td>
                          <td className="py-3 px-4 text-center font-bold text-green-700">{totalAvailable}</td>
                          <td className="py-3 px-4 text-center font-bold text-orange-700">{totalSeats - totalAvailable}</td>
                          <td className="py-3 px-4 text-center font-bold text-primary">
                            {totalSeats ? Math.round(((totalSeats - totalAvailable) / totalSeats) * 100) : 0}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No vacancy data found</p>
                    <p className="text-sm">Upload vacancy data to see district-wise breakdown with gender and category details</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
