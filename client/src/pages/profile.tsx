import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { User, Lock, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  district?: string;
  firstName: string;
  lastName: string;
}

export default function Profile() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [defaultPassword, setDefaultPassword] = useState('Punjab@2024');

  // Get current user
  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return apiRequest('/api/auth/change-password', {
        method: 'PUT',
        body: data,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Password changed successfully',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to change password',
        variant: 'destructive',
      });
    },
  });

  // CSV import mutation (only for central admin)
  const importUsersMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch('/api/users/import', {
        method: 'POST',
        body: data,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Import Complete',
        description: `Imported ${data.importedCount} users, skipped ${data.skippedCount}`,
      });
      setCsvFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import users',
        variant: 'destructive',
      });
    },
  });

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'New passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters long',
        variant: 'destructive',
      });
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleCsvImport = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!csvFile) {
      toast({
        title: 'Error',
        description: 'Please select a CSV file',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('defaultPassword', defaultPassword);

    importUsersMutation.mutate(formData);
  };

  if (userLoading) {
    return <div data-testid="loading-profile">Loading profile...</div>;
  }

  if (!user) {
    return <div data-testid="error-no-user">No user data available</div>;
  }

  return (
    <div className="container mx-auto py-8 space-y-6" data-testid="profile-page">
      <div className="flex items-center gap-3 mb-6">
        <User className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Profile Settings</h1>
      </div>

      {/* User Information */}
      <Card data-testid="card-user-info">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Information
          </CardTitle>
          <CardDescription>Your account details and role information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Username</Label>
              <div className="font-medium" data-testid="text-username">{user.username}</div>
            </div>
            <div>
              <Label>Email</Label>
              <div className="font-medium" data-testid="text-email">{user.email || 'Not set'}</div>
            </div>
            <div>
              <Label>Role</Label>
              <div>
                <Badge variant={user.role === 'central_admin' ? 'default' : 'secondary'} data-testid="badge-role">
                  {user.role.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </div>
            <div>
              <Label>District</Label>
              <div className="font-medium" data-testid="text-district">{user.district || 'N/A'}</div>
            </div>
            <div>
              <Label>First Name</Label>
              <div className="font-medium" data-testid="text-firstname">{user.firstName}</div>
            </div>
            <div>
              <Label>Last Name</Label>
              <div className="font-medium" data-testid="text-lastname">{user.lastName}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card data-testid="card-change-password">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                data-testid="input-current-password"
              />
            </div>
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              type="submit"
              disabled={changePasswordMutation.isPending}
              data-testid="button-change-password"
            >
              {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* CSV User Import - Only for Central Admin */}
      {user.role === 'central_admin' && (
        <Card data-testid="card-csv-import">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Users from CSV
            </CardTitle>
            <CardDescription>
              Import multiple users from a CSV file. All users will have the same default password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertDescription>
                CSV should contain columns: username, email, role, district, firstName, lastName
              </AlertDescription>
            </Alert>
            <form onSubmit={handleCsvImport} className="space-y-4">
              <div>
                <Label htmlFor="default-password">Default Password for All Users</Label>
                <Input
                  id="default-password"
                  type="text"
                  value={defaultPassword}
                  onChange={(e) => setDefaultPassword(e.target.value)}
                  required
                  data-testid="input-default-password"
                />
              </div>
              <div>
                <Label htmlFor="csv-file">CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  required
                  data-testid="input-csv-file"
                />
              </div>
              <Button
                type="submit"
                disabled={importUsersMutation.isPending || !csvFile}
                data-testid="button-import-users"
              >
                {importUsersMutation.isPending ? 'Importing...' : 'Import Users'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}