import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { GraduationCap, User, Shield } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

interface DemoUser {
  username: string;
  role: string;
  firstName: string;
  lastName: string;
  district: string | null;
}

export default function Login() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Fetch demo users  
  const { data: demoUsers = [], isLoading: isDemoUsersLoading, error: demoUsersError } = useQuery<DemoUser[]>({
    queryKey: ["/api/auth/demo-users"],
    enabled: true,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof loginSchema>) => {
      await apiRequest("POST", "/api/auth/login", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Login Successful",
        description: "Welcome to the Seat Allotment System",
      });
    },
    onError: (error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const demoLoginMutation = useMutation({
    mutationFn: async (username: string) => {
      await apiRequest("POST", "/api/auth/demo-login", { username });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Demo Login Successful",
        description: "Welcome to the Seat Allotment System",
      });
    },
    onError: (error) => {
      toast({
        title: "Demo Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate(values);
  }

  function onDemoLogin(username: string) {
    demoLoginMutation.mutate(username);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-4">
            <GraduationCap className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Seat Allotment System</CardTitle>
          <CardDescription>
            Sign in to access the management dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter your username" 
                        data-testid="input-username"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <PasswordInput 
                        placeholder="Enter your password"
                        data-testid="input-password" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>

          {/* Demo Login Section */}
          {demoUsers && demoUsers.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Demo Logins (Development Only)
              </p>
              <div className="space-y-2">
                {/* Central Admin Demo Login */}
                {demoUsers.find((user: any) => user.role === 'central_admin') && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center gap-2"
                    disabled={demoLoginMutation.isPending}
                    onClick={() => onDemoLogin('central_admin')}
                    data-testid="button-demo-login-central"
                  >
                    <Shield className="w-4 h-4" />
                    {demoLoginMutation.isPending ? "Logging in..." : "Central Admin Demo"}
                  </Button>
                )}
                
                {/* District Admin Demo Login - Show first few */}
                {demoUsers
                  .filter((user: any) => user.role === 'district_admin')
                  .slice(0, 3)
                  .map((user: any) => (
                    <Button
                      key={user.username}
                      type="button"
                      variant="outline"
                      className="w-full flex items-center gap-2 text-sm"
                      disabled={demoLoginMutation.isPending}
                      onClick={() => onDemoLogin(user.username)}
                      data-testid={`button-demo-login-${user.username}`}
                    >
                      <User className="w-4 h-4" />
                      {demoLoginMutation.isPending 
                        ? "Logging in..." 
                        : `${user.firstName} ${user.lastName} (${user.district})`
                      }
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
