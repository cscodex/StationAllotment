import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DataPagination } from "@/components/ui/data-pagination";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  UserPlus,
  Ban,
  Shield
} from "lucide-react";
import type { User } from "@shared/schema";
import { DISTRICTS } from "@shared/schema";

const createAdminSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  district: z.enum(DISTRICTS as any),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
});

const updateAdminSchema = createAdminSchema.partial().omit({ password: true });

export default function ManageDistrictAdmins() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const districtAdmins = users?.filter(user => user.role === 'district_admin') || [];
  
  // Pagination logic
  const totalAdmins = districtAdmins.length;
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAdmins = districtAdmins.slice(startIndex, endIndex);

  const createForm = useForm<z.infer<typeof createAdminSchema>>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: {
      username: '',
      password: '',
      district: undefined,
      firstName: '',
      lastName: '',
      email: '',
    },
  });

  const editForm = useForm<z.infer<typeof updateAdminSchema>>({
    resolver: zodResolver(updateAdminSchema),
    defaultValues: {
      username: '',
      district: undefined,
      firstName: '',
      lastName: '',
      email: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createAdminSchema>) => {
      await apiRequest("POST", "/api/users", {
        ...data,
        role: 'district_admin',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowCreateDialog(false);
      createForm.reset();
      toast({
        title: "Admin Created",
        description: "District administrator has been created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: z.infer<typeof updateAdminSchema> }) => {
      await apiRequest("PUT", `/api/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingAdmin(null);
      editForm.reset();
      toast({
        title: "Admin Updated",
        description: "District administrator has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Admin Deleted",
        description: "District administrator has been deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const blockMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PUT", `/api/users/${id}/block`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Admin Blocked",
        description: "District administrator has been blocked successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Block Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PUT", `/api/users/${id}/unblock`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Admin Unblocked",
        description: "District administrator has been unblocked successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Unblock Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startEdit = (admin: User) => {
    setEditingAdmin(admin);
    editForm.reset({
      username: admin.username,
      district: admin.district as any,
      firstName: admin.firstName || '',
      lastName: admin.lastName || '',
      email: admin.email || '',
    });
  };

  const cancelEdit = () => {
    setEditingAdmin(null);
    editForm.reset();
  };

  const onCreateSubmit = (values: z.infer<typeof createAdminSchema>) => {
    createMutation.mutate(values);
  };

  const onEditSubmit = (values: z.infer<typeof updateAdminSchema>) => {
    if (editingAdmin) {
      updateMutation.mutate({ id: editingAdmin.id, data: values });
    }
  };


  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Manage District Administrators" 
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Manage District Administrators" }
        ]}
      />

      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Users className="w-5 h-5 mr-2 text-primary" />
                District Administrators
              </div>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-admin">
                    <Plus className="w-4 h-4 mr-2" />
                    Add District Admin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      <UserPlus className="w-5 h-5 mr-2 inline" />
                      Create District Administrator
                    </DialogTitle>
                  </DialogHeader>
                  <Form {...createForm}>
                    <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={createForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter first name" {...field} data-testid="input-first-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter last name" {...field} data-testid="input-last-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={createForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="Enter email address" {...field} data-testid="input-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter username" {...field} data-testid="input-username" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Enter password" {...field} data-testid="input-password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="district"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-district">
                                  <SelectValue placeholder="Select district" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {DISTRICTS.map(district => (
                                  <SelectItem key={district} value={district}>
                                    {district}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-admin">
                          {createMutation.isPending ? "Creating..." : "Create Admin"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
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
                        <TableHead>Name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>District</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAdmins.map((admin) => (
                        <TableRow key={admin.id}>
                          <TableCell>
                            <div className="font-medium" data-testid={`text-name-${admin.id}`}>
                              {admin.firstName} {admin.lastName}
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-username-${admin.id}`}>
                            {admin.username}
                          </TableCell>
                          <TableCell data-testid={`text-email-${admin.id}`}>
                            {admin.email || 'N/A'}
                          </TableCell>
                          <TableCell data-testid={`text-district-${admin.id}`}>
                            <Badge variant="outline">{admin.district}</Badge>
                          </TableCell>
                          <TableCell data-testid={`status-${admin.id}`}>
                            {admin.isBlocked ? (
                              <Badge variant="destructive">
                                Blocked
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                Active
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(admin)}
                                data-testid={`button-edit-${admin.id}`}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              
                              {admin.isBlocked ? (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600 hover:text-green-700"
                                      data-testid={`button-unblock-${admin.id}`}
                                    >
                                      <Shield className="w-3 h-3" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Unblock Administrator</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to unblock {admin.firstName} {admin.lastName}? 
                                        They will be able to access the system again.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => unblockMutation.mutate(admin.id)}
                                        disabled={unblockMutation.isPending}
                                        data-testid={`confirm-unblock-${admin.id}`}
                                      >
                                        {unblockMutation.isPending ? "Unblocking..." : "Unblock"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              ) : (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-orange-600 hover:text-orange-700"
                                      data-testid={`button-block-${admin.id}`}
                                    >
                                      <Ban className="w-3 h-3" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Block Administrator</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to block {admin.firstName} {admin.lastName}? 
                                        They will not be able to access the system until unblocked.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => blockMutation.mutate(admin.id)}
                                        disabled={blockMutation.isPending}
                                        data-testid={`confirm-block-${admin.id}`}
                                        className="bg-orange-600 hover:bg-orange-700"
                                      >
                                        {blockMutation.isPending ? "Blocking..." : "Block"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 hover:text-red-700"
                                    data-testid={`button-delete-${admin.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Administrator</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete {admin.firstName} {admin.lastName}? 
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(admin.id)}
                                      disabled={deleteMutation.isPending}
                                      data-testid={`confirm-delete-${admin.id}`}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      {deleteMutation.isPending ? "Deleting..." : "Delete"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <DataPagination
                  currentPage={currentPage}
                  totalItems={totalAdmins}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(newLimit) => {
                    setItemsPerPage(newLimit);
                    setCurrentPage(0); // Reset to first page when changing items per page
                  }}
                  showItemsPerPageSelector={true}
                  itemsPerPageOptions={[10, 25, 50, 100]}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editingAdmin} onOpenChange={(open) => !open && cancelEdit()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <Edit2 className="w-5 h-5 mr-2 inline" />
                Edit District Administrator
              </DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter first name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter email address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="district"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>District</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select district" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DISTRICTS.map(district => (
                            <SelectItem key={district} value={district}>
                              {district}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Updating..." : "Update Admin"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}