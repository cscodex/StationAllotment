export interface User {
  id: string;
  username: string;
  role: 'central_admin' | 'district_admin';
  district?: string;
  firstName?: string;
  lastName?: string;
}

export interface Student {
  id: string;
  meritNumber: number;
  applicationNumber?: string;
  name: string;
  stream: 'Medical' | 'Commerce' | 'NonMedical';
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
  allottedDistrict?: string;
  allottedStream?: string;
  allocationStatus?: 'pending' | 'allotted' | 'not_allotted';
  createdAt: string;
  updatedAt: string;
}

export interface Vacancy {
  id: string;
  district: string;
  medicalVacancies: number;
  commerceVacancies: number;
  nonMedicalVacancies: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface DashboardStats {
  totalStudents: number;
  totalVacancies: number;
  pendingAllocations: number;
  completionRate: number;
}
