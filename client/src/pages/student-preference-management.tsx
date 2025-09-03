import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Search, Save, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { DISTRICTS } from '@shared/schema';

interface StudentsEntranceResult {
  id: string;
  meritNo: number;
  applicationNo: string;
  rollNo: string;
  studentName: string;
  marks: number;
  gender: string;
  stream: string;
  createdAt: string;
  updatedAt: string;
}

interface StudentPreferences {
  choice1?: string;
  choice2?: string;
  choice3?: string;
  choice4?: string;
  choice5?: string;
  choice6?: string;
  choice7?: string;
  choice8?: string;
  choice9?: string;
  choice10?: string;
}

function StudentPreferenceManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentsEntranceResult | null>(null);
  const [preferences, setPreferences] = useState<StudentPreferences>({});
  const [studentId, setStudentId] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Search students entrance results
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['search-entrance-results', searchQuery],
    queryFn: () => apiRequest(`/api/students-entrance-results/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.length >= 2,
    staleTime: 30000,
  });

  // Get vacancies for district options
  const { data: vacancies = [] } = useQuery({
    queryKey: ['/api/vacancies'],
    queryFn: () => apiRequest('/api/vacancies'),
    staleTime: 300000, // 5 minutes
  });

  // Create or update student record mutation
  const createStudentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create student');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/students'] });
    },
  });

  // Update student preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async ({ entranceResultId, studentId, preferences }: {
      entranceResultId: string;
      studentId: string;
      preferences: StudentPreferences;
    }) => {
      const response = await fetch(`/api/students-entrance-results/${entranceResultId}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId, preferences }),
      });
      if (!response.ok) throw new Error('Failed to update preferences');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Student preferences updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/students'] });
      // Reset form
      setSelectedStudent(null);
      setPreferences({});
      setStudentId('');
      setSearchQuery('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  const handleStudentSelect = async (student: StudentsEntranceResult) => {
    setSelectedStudent(student);
    
    // Check if student already exists in students table
    try {
      const existingStudents = await apiRequest('/api/students?limit=10000', {}, 60000); // 60 second timeout
      const existingStudent = (existingStudents as any).students?.find(
        (s: any) => s.appNo === student.applicationNo || s.meritNumber === student.meritNo
      );

      if (existingStudent) {
        // Load existing preferences
        setStudentId(existingStudent.id);
        setPreferences({
          choice1: existingStudent.choice1,
          choice2: existingStudent.choice2,
          choice3: existingStudent.choice3,
          choice4: existingStudent.choice4,
          choice5: existingStudent.choice5,
          choice6: existingStudent.choice6,
          choice7: existingStudent.choice7,
          choice8: existingStudent.choice8,
          choice9: existingStudent.choice9,
          choice10: existingStudent.choice10,
        });
      } else {
        // Create new student record
        const newStudentData = {
          appNo: student.applicationNo,
          meritNumber: student.meritNo,
          name: student.studentName,
          stream: student.stream,
        };

        const newStudent = await createStudentMutation.mutateAsync(newStudentData);
        setStudentId(newStudent.id);
        setPreferences({});
      }
    } catch (error) {
      console.error('Error handling student selection:', error);
      toast({
        title: "Error",
        description: "Failed to load student data",
        variant: "destructive",
      });
    }
  };

  const handlePreferenceChange = (choiceNumber: number, district: string) => {
    setPreferences(prev => ({
      ...prev,
      [`choice${choiceNumber}`]: district,
    }));
  };

  const handleSubmit = () => {
    if (!selectedStudent || !studentId) {
      toast({
        title: "Error",
        description: "Please select a student first",
        variant: "destructive",
      });
      return;
    }

    updatePreferencesMutation.mutate({
      entranceResultId: selectedStudent.id,
      studentId,
      preferences,
    });
  };

  // Get unique districts from vacancies
  const availableDistricts = Array.isArray(vacancies) 
    ? vacancies
        .map((v: any) => v.district)
        .filter((district: string, index: number, array: string[]) => array.indexOf(district) === index)
        .sort()
    : [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Student Preference Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Search and set district preferences for students
          </p>
        </div>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Student
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search by Name, Merit No, Application No, or Roll No</Label>
              <Input
                id="search"
                data-testid="input-search-student"
                placeholder="Enter student name, merit number, application number, or roll number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Search Results */}
          {searchQuery.length >= 2 && (
            <div className="mt-4">
              {isSearching ? (
                <p className="text-gray-600 dark:text-gray-400">Searching...</p>
              ) : Array.isArray(searchResults) && searchResults.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="font-semibold">Search Results:</h3>
                  <div className="grid gap-2 max-h-60 overflow-y-auto">
                    {(searchResults as StudentsEntranceResult[]).map((student: StudentsEntranceResult) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => handleStudentSelect(student)}
                        data-testid={`card-student-${student.meritNo}`}
                      >
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-semibold">{student.studentName}</p>
                            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                              <span>Merit: {student.meritNo}</span>
                              <span>App: {student.applicationNo}</span>
                              <span>Roll: {student.rollNo}</span>
                              <span>Marks: {student.marks}</span>
                            </div>
                          </div>
                          <Badge variant="outline">{student.stream}</Badge>
                          <Badge variant="secondary">{student.gender}</Badge>
                        </div>
                        <Button variant="outline" size="sm" data-testid={`button-select-${student.meritNo}`}>
                          Select
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-gray-600 dark:text-gray-400">No students found</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Student & Preferences Section */}
      {selectedStudent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Set District Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Selected Student Info */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">Selected Student:</h3>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Name:</span>
                  <p className="font-medium" data-testid="text-selected-student-name">{selectedStudent.studentName}</p>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Merit No:</span>
                  <p className="font-medium" data-testid="text-selected-student-merit">{selectedStudent.meritNo}</p>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Application No:</span>
                  <p className="font-medium">{selectedStudent.applicationNo}</p>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Stream:</span>
                  <p className="font-medium">{selectedStudent.stream}</p>
                </div>
              </div>
            </div>

            {/* District Preferences Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((choiceNum) => (
                <div key={choiceNum}>
                  <Label htmlFor={`choice${choiceNum}`}>Choice {choiceNum}</Label>
                  <Select
                    value={preferences[`choice${choiceNum}` as keyof StudentPreferences] || ''}
                    onValueChange={(value) => handlePreferenceChange(choiceNum, value)}
                  >
                    <SelectTrigger data-testid={`select-choice-${choiceNum}`}>
                      <SelectValue placeholder="Select district" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDistricts.map((district: string) => (
                        <SelectItem key={district} value={district}>
                          {district}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedStudent(null);
                  setPreferences({});
                  setStudentId('');
                  setSearchQuery('');
                }}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={updatePreferencesMutation.isPending}
                data-testid="button-save-preferences"
              >
                <Save className="h-4 w-4 mr-2" />
                {updatePreferencesMutation.isPending ? 'Saving...' : 'Save Preferences'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>• Search for students using their name, merit number, application number, or roll number</p>
          <p>• Select a student from the search results to set their district preferences</p>
          <p>• You can set up to 10 district preferences in order of priority</p>
          <p>• Duplicate districts are allowed across different choices</p>
          <p>• All preferences will be saved with your district and admin details automatically</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default StudentPreferenceManagement;