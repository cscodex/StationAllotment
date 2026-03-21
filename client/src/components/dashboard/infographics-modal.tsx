import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface InfographicsModalProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  stats: any;
  title?: string;
}

export default function InfographicsModal({ isOpen, onClose, stats, title = "Statistics Overview" }: InfographicsModalProps) {
  const totalStudents = stats ? (stats.lockedStudents + stats.unlockedStudents) : 0;
  
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {!stats ? (
          <div className="p-8 text-center text-muted-foreground">
            Loading statistics from database...
          </div>
        ) : totalStudents > 0 ? (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lock Status</CardTitle>
                <p className="text-xs text-muted-foreground">{lockedStudents} locked / {totalStudents} total</p>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{name: 'Locked', value: lockedStudents}, {name: 'Unlocked', value: unlockedStudents}]} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name, value}) => `${name}: ${value}`} labelLine={false}>
                      <Cell fill="#6366f1" />
                      <Cell fill="#e2e8f0" />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Preferences Filled</CardTitle>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{name: 'Filled', value: studentsWithPreferences}, {name: 'Pending', value: studentsWithoutPreferences}]} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name, value}) => `${name}: ${value}`} labelLine={false}>
                      <Cell fill="#22c55e" />
                      <Cell fill="#f59e0b" />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Stream Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Object.entries(streamBreakdown || {}).map(([name, value]) => ({ name, value }))} margin={{top: 5, right: 10, left: 0, bottom: 5}}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{fontSize: 11}} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} name="Students" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            </Card>
          )}
        </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            No student data available to display statistics.
          </div>
        )}
      </DialogContent>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={districtBreakdown} margin={{top: 5, right: 10, left: 0, bottom: 35}}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="district" tick={{fontSize: 10}} angle={-45} textAnchor="end" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="locked" name="Locked" fill="#16a34a" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="unlocked" name="Unlocked" fill="#facc15" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            No student data available to display statistics.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
