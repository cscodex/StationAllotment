import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, MapPin, Plus } from "lucide-react";
import type { User } from "@/types";

export default function DistrictAdminList() {
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const districtAdmins = users?.filter(user => user.role === 'district_admin') || [];

  const getStatusBadge = (user: User) => {
    return <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>;
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="District Administrators" 
        breadcrumbs={[
          { name: "Home" },
          { name: "District Administrators" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Users className="w-5 h-5 mr-2 text-primary" />
                District Admin Accounts
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Districts</p>
                <p className="text-2xl font-bold" data-testid="total-district-admins">{districtAdmins.length}</p>
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
                        <TableHead>Username</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {districtAdmins.map((admin: User) => (
                        <TableRow key={admin.id} data-testid={`admin-row-${admin.district}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                              {admin.district}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{admin.username}</TableCell>
                          <TableCell>{admin.firstName} {admin.lastName}</TableCell>
                          <TableCell>{getStatusBadge(admin)}</TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" data-testid={`button-edit-${admin.district}`}>
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {districtAdmins.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No district administrators found.</p>
                  </div>
                )}

                <div className="flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {districtAdmins.length} district administrators across Punjab
                  </p>
                  <Badge variant="outline" className="text-xs">
                    All districts covered
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}