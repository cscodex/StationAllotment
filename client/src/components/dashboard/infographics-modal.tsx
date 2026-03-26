import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

interface InfographicsModalProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  stats: any;
  title?: string;
}

export default function InfographicsModal({ isOpen, onClose, stats, title = "Statistics Overview" }: InfographicsModalProps) {
  if (!isOpen) return null;

  const totalStudents = stats ? (stats.lockedStudents + stats.unlockedStudents) : 0;
  const lockedStudents = stats?.lockedStudents || 0;
  const unlockedStudents = stats?.unlockedStudents || 0;
  const studentsWithPreferences = stats?.studentsWithPreferences || 0;
  const studentsWithoutPreferences = stats?.studentsWithoutPreferences || 0;
  const streamBreakdown = stats?.streamBreakdown || {};
  const districtBreakdown = stats?.districtBreakdown || [];

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
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Lock Status</CardTitle>
                  <p className="text-xs text-muted-foreground">{lockedStudents} locked / {totalStudents} total</p>
                </CardHeader>
                <CardContent className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{name: 'Locked', value: lockedStudents}, {name: 'Unlocked', value: unlockedStudents}]} cx="50%" cy="50%" outerRadius={70} dataKey="value">
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
                      <Pie data={[{name: 'Filled', value: studentsWithPreferences}, {name: 'Pending', value: studentsWithoutPreferences}]} cx="50%" cy="50%" outerRadius={70} dataKey="value">
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
                    <BarChart data={Object.entries(streamBreakdown).map(([name, value]) => ({ name, value: value as number }))} margin={{top: 5, right: 10, left: 0, bottom: 5}}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{fontSize: 11}} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} name="Students">
                        <LabelList dataKey="value" position="top" style={{ fontSize: '10px' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            
            {districtBreakdown && districtBreakdown.length > 0 && (
              <Card className="mt-4 mx-2">
                <CardContent className="h-[350px] pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={districtBreakdown.filter((d: any) => d.locked > 0 || d.unlocked > 0).map((d: any) => ({ name: d.district, value: d.locked + d.unlocked, locked: d.locked, unlocked: d.unlocked }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {districtBreakdown.filter((d: any) => d.locked > 0 || d.unlocked > 0).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={`hsl(${(index * 360) / districtBreakdown.length}, 70%, 50%)`} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name, props) => [`Total: ${value} (Locked: ${props.payload.locked}, Unlocked: ${props.payload.unlocked})`, name]} />
                      <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
                <CardHeader className="pt-0 pb-4 text-center">
                  <CardTitle className="text-sm">District-wise Total Students (Donut)</CardTitle>
                </CardHeader>
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
