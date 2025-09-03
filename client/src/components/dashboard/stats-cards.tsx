import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, MapPin, Clock, PieChart, TrendingUp, TrendingDown } from "lucide-react";
import type { DashboardStats } from "@/types";

interface StatsCardsProps {
  stats?: DashboardStats;
  isLoading: boolean;
}

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-4" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total Students",
      value: stats?.totalStudents || 0,
      icon: Users,
      color: "bg-primary/10 text-primary",
      trend: { value: 12.5, isPositive: true, label: "from last year" },
    },
    {
      title: "Total Vacancies", 
      value: stats?.totalVacancies || 0,
      icon: MapPin,
      color: "bg-green-500/10 text-green-500",
      trend: { value: 8.2, isPositive: true, label: "available seats" },
    },
    {
      title: "Pending Allocations",
      value: stats?.pendingAllocations || 0,
      icon: Clock,
      color: "bg-amber-500/10 text-amber-500",
      trend: { value: 23.1, isPositive: false, label: "awaiting process" },
    },
    {
      title: "Completion Rate",
      value: `${stats?.completionRate || 0}%`,
      icon: PieChart,
      color: "bg-blue-500/10 text-blue-500",
      trend: { value: 4.3, isPositive: true, label: "improvement" },
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => (
        <Card key={index}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-3xl font-bold" data-testid={`stat-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  {card.value}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              {card.trend.isPositive ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={card.trend.isPositive ? "text-green-500" : "text-red-500"}>
                {card.trend.value}%
              </span>
              <span className="text-muted-foreground ml-1">{card.trend.label}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
