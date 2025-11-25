import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface TestCase {
  id: string;
  feature: string;
  testCase: string;
  expectedResult: string;
  status: "pass" | "fail" | "pending";
  notes?: string;
}

const testCases: TestCase[] = [
  // Session Management
  {
    id: "TC-001",
    feature: "Session Management",
    testCase: "Create counseling round for current session (2025-2026)",
    expectedResult: "Round created successfully",
    status: "pending",
  },
  {
    id: "TC-002",
    feature: "Session Management",
    testCase: "Attempt to create counseling round for previous session (2024-2025)",
    expectedResult: "Error: Cannot create rounds for previous sessions",
    status: "pending",
  },
  {
    id: "TC-003",
    feature: "Session Management",
    testCase: "Attempt to create counseling round for future session (2026-2027)",
    expectedResult: "Error: Cannot create rounds for future sessions",
    status: "pending",
  },
  
  // Round Creation
  {
    id: "TC-004",
    feature: "Round Creation",
    testCase: "Create counseling with multiple rounds (same counseling title)",
    expectedResult: "Rounds auto-numbered as 1, 2, 3...",
    status: "pending",
  },
  {
    id: "TC-005",
    feature: "Round Creation",
    testCase: "Create round without end date",
    expectedResult: "Round created with only start datetime",
    status: "pending",
  },
  {
    id: "TC-006",
    feature: "Round Creation",
    testCase: "Create round with start datetime in future",
    expectedResult: "Round created but not active",
    status: "pending",
  },
  
  // Automatic Activation
  {
    id: "TC-007",
    feature: "Automatic Activation",
    testCase: "Round with start datetime in past should auto-activate",
    expectedResult: "Round automatically becomes active",
    status: "pending",
  },
  {
    id: "TC-008",
    feature: "Automatic Activation",
    testCase: "Round with start datetime in future should remain inactive",
    expectedResult: "Round remains inactive until start datetime",
    status: "pending",
  },
  {
    id: "TC-009",
    feature: "Automatic Activation",
    testCase: "Previous session rounds should auto-deactivate",
    expectedResult: "All previous session rounds deactivated",
    status: "pending",
  },
  
  // Round Editing
  {
    id: "TC-010",
    feature: "Round Editing",
    testCase: "Edit start datetime of inactive round",
    expectedResult: "Start datetime updated successfully",
    status: "pending",
  },
  {
    id: "TC-011",
    feature: "Round Editing",
    testCase: "Edit start datetime of active round",
    expectedResult: "Start datetime updated (may affect activation)",
    status: "pending",
  },
  {
    id: "TC-012",
    feature: "Round Editing",
    testCase: "Attempt to edit completed round",
    expectedResult: "Edit button disabled",
    status: "pending",
  },
  
  // Round Deletion
  {
    id: "TC-013",
    feature: "Round Deletion",
    testCase: "Delete inactive round with future start datetime",
    expectedResult: "Round deleted successfully",
    status: "pending",
  },
  {
    id: "TC-014",
    feature: "Round Deletion",
    testCase: "Attempt to delete past round (start datetime passed)",
    expectedResult: "Error: Cannot delete past counseling rounds",
    status: "pending",
  },
  {
    id: "TC-015",
    feature: "Round Deletion",
    testCase: "Attempt to delete active round",
    expectedResult: "Delete button disabled or error shown",
    status: "pending",
  },
  {
    id: "TC-016",
    feature: "Round Deletion",
    testCase: "Attempt to delete completed round",
    expectedResult: "Delete button disabled",
    status: "pending",
  },
  
  // Allocation Order
  {
    id: "TC-017",
    feature: "Allocation Order",
    testCase: "Run allocation for Round 1",
    expectedResult: "Allocation runs successfully",
    status: "pending",
  },
  {
    id: "TC-018",
    feature: "Allocation Order",
    testCase: "Attempt to run allocation for Round 2 before Round 1 is completed",
    expectedResult: "Error: Cannot run Round 2 before Round 1 is completed",
    status: "pending",
  },
  {
    id: "TC-019",
    feature: "Allocation Order",
    testCase: "Complete Round 1, then run allocation for Round 2",
    expectedResult: "Round 2 allocation runs successfully",
    status: "pending",
  },
  {
    id: "TC-020",
    feature: "Allocation Order",
    testCase: "Run allocation for Round 3 when Round 1 completed but Round 2 not completed",
    expectedResult: "Error: Cannot run Round 3 before Round 2 is completed",
    status: "pending",
  },
  
  // Allocation Logic
  {
    id: "TC-021",
    feature: "Allocation Logic",
    testCase: "Run allocation with students having preferences and vacancies available",
    expectedResult: "Students allocated to seats based on merit and preferences",
    status: "pending",
  },
  {
    id: "TC-022",
    feature: "Allocation Logic",
    testCase: "Run allocation with no available vacancies",
    expectedResult: "All students marked as not_allotted",
    status: "pending",
  },
  {
    id: "TC-023",
    feature: "Allocation Logic",
    testCase: "Run allocation - students allocated in merit order",
    expectedResult: "Higher merit students get preferred choices",
    status: "pending",
  },
  {
    id: "TC-024",
    feature: "Allocation Logic",
    testCase: "Run allocation - strict matching (gender, category, stream, district)",
    expectedResult: "Only exact matches allocated",
    status: "pending",
  },
  
  // Data Management
  {
    id: "TC-025",
    feature: "Data Management",
    testCase: "Upload student choices file",
    expectedResult: "Students imported and associated with active round",
    status: "pending",
  },
  {
    id: "TC-026",
    feature: "Data Management",
    testCase: "Upload vacancies file",
    expectedResult: "Vacancies imported for current session",
    status: "pending",
  },
  {
    id: "TC-027",
    feature: "Data Management",
    testCase: "Upload entrance results file",
    expectedResult: "Entrance results imported and linked to students",
    status: "pending",
  },
  
  // UI/UX
  {
    id: "TC-028",
    feature: "UI/UX",
    testCase: "No activate button visible on rounds",
    expectedResult: "Activate button removed from all rounds",
    status: "pending",
  },
  {
    id: "TC-029",
    feature: "UI/UX",
    testCase: "Edit button visible on inactive/active rounds",
    expectedResult: "Edit button available for non-completed rounds",
    status: "pending",
  },
  {
    id: "TC-030",
    feature: "UI/UX",
    testCase: "Current session warning displayed",
    expectedResult: "Warning shown when non-current session selected",
    status: "pending",
  },
];

export default function TestCases() {
  const { user } = useAuth();

  if (user?.role !== 'central_admin') {
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Test Cases" />
        <main className="flex-1 p-6">
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">Access restricted to central administrators.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pass":
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle className="w-3 h-3 mr-1" />
            Pass
          </Badge>
        );
      case "fail":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Fail
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <AlertCircle className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const groupedTests = testCases.reduce((acc, test) => {
    if (!acc[test.feature]) {
      acc[test.feature] = [];
    }
    acc[test.feature].push(test);
    return acc;
  }, {} as Record<string, TestCase[]>);

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="System Test Cases"
        breadcrumbs={[
          { name: "Home" },
          { name: "Administration" },
          { name: "Test Cases" }
        ]}
      />
      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle>Comprehensive Test Cases for Station Allotment System</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              This table contains all test cases for validating the system functionality.
              Mark tests as Pass/Fail after execution.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {Object.entries(groupedTests).map(([feature, tests]) => (
                <div key={feature}>
                  <h3 className="text-lg font-semibold mb-4">{feature}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Test ID</TableHead>
                        <TableHead>Test Case</TableHead>
                        <TableHead>Expected Result</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tests.map((test) => (
                        <TableRow key={test.id}>
                          <TableCell className="font-mono text-sm">{test.id}</TableCell>
                          <TableCell>{test.testCase}</TableCell>
                          <TableCell className="text-muted-foreground">{test.expectedResult}</TableCell>
                          <TableCell>{getStatusBadge(test.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {test.notes || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}



