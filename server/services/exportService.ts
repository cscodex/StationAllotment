import { IStorage } from '../storage';
import PDFDocument from 'pdfkit';

export class ExportService {
  constructor(private storage: IStorage) {}

  async exportResultsAsCSV(): Promise<string> {
    const students = await this.storage.getStudents(10000, 0); // Get all students
    
    const headers = [
      'Merit Number',
      'Application Number', 
      'Name',
      'Stream',
      'Choice 1', 'Choice 2', 'Choice 3', 'Choice 4', 'Choice 5',
      'Choice 6', 'Choice 7', 'Choice 8', 'Choice 9', 'Choice 10',
      'Allotted District',
      'Allotted Stream',
      'Status'
    ];

    const rows = students.map(student => [
      student.meritNumber,
      student.appNo || '',
      student.name,
      student.stream,
      student.choice1 || '',
      student.choice2 || '',
      student.choice3 || '',
      student.choice4 || '',
      student.choice5 || '',
      student.choice6 || '',
      student.choice7 || '',
      student.choice8 || '',
      student.choice9 || '',
      student.choice10 || '',
      student.allottedDistrict || '',
      student.allottedStream || '',
      student.allocationStatus || 'pending'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  async exportResultsAsPDF(): Promise<Buffer> {
    const students = await this.storage.getStudents(10000, 0); // Get all students
    const stats = await this.storage.getDashboardStats();
    const vacancies = await this.storage.getVacancies();

    return new Promise((resolve, reject) => {
      try {
        // Create PDF in landscape mode for better readability
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // PAGE 1: SUMMARY DASHBOARD
        this.generateSummaryPage(doc, students, stats, vacancies);
        
        // PAGE 2+: DETAILED STUDENT RECORDS
        this.generateDetailedStudentRecords(doc, students);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private generateSummaryPage(doc: any, students: any[], stats: any, vacancies: any[]) {
    const currentDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });

    // Header
    doc.fontSize(24).fillColor('#2563eb').text('Punjab Seat Allotment System', { align: 'center' });
    doc.fontSize(18).fillColor('#64748b').text('Summary Dashboard Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).fillColor('#374151').text(`Report Generated: ${currentDate}`, { align: 'center' });
    doc.moveDown(2);

    // Statistics Cards
    const allottedStudents = students.filter(s => s.allocationStatus === 'allotted');
    const notAllottedStudents = students.filter(s => s.allocationStatus === 'not_allotted');
    
    this.drawStatsCard(doc, 50, 150, 'Total Candidates', students.length.toString(), '#3b82f6');
    this.drawStatsCard(doc, 200, 150, 'Students Allotted', allottedStudents.length.toString(), '#10b981');
    this.drawStatsCard(doc, 350, 150, 'Students Not Allotted', notAllottedStudents.length.toString(), '#ef4444');
    this.drawStatsCard(doc, 500, 150, 'Total Vacancies', (stats?.totalVacancies || 0).toString(), '#8b5cf6');
    this.drawStatsCard(doc, 650, 150, 'Completion Rate', `${Math.round((allottedStudents.length / (students.length || 1)) * 100)}%`, '#f59e0b');

    // District-wise allocation table
    doc.moveDown(8);
    doc.fontSize(16).fillColor('#1f2937').text('District-wise Allocation Summary', { align: 'center' });
    doc.moveDown();
    
    this.generateDistrictTable(doc, students, vacancies);
  }

  private drawStatsCard(doc: any, x: number, y: number, title: string, value: string, color: string) {
    // Card background
    doc.rect(x, y, 120, 80).fillAndStroke('#f8fafc', '#e2e8f0');
    
    // Title
    doc.fontSize(10).fillColor('#64748b').text(title, x + 10, y + 15, { width: 100, align: 'center' });
    
    // Value
    doc.fontSize(20).fillColor(color).text(value, x + 10, y + 35, { width: 100, align: 'center' });
  }

  private generateDistrictTable(doc: any, students: any[], vacancies: any[]) {
    // Group students by allotted district
    const districtAllocations: { [key: string]: number } = {};
    students.filter(s => s.allottedDistrict).forEach(student => {
      if (student.allottedDistrict) {
        districtAllocations[student.allottedDistrict] = (districtAllocations[student.allottedDistrict] || 0) + 1;
      }
    });

    // Table headers
    const startY = 320;
    const colWidth = 120;
    const rowHeight = 25;
    
    doc.fontSize(10).fillColor('#374151');
    
    // Header row
    doc.rect(50, startY, colWidth * 6, rowHeight).fillAndStroke('#f1f5f9', '#d1d5db');
    doc.text('District', 55, startY + 8);
    doc.text('Students Allocated', 55 + colWidth, startY + 8);
    doc.text('Medical Vacancies', 55 + colWidth * 2, startY + 8);
    doc.text('Commerce Vacancies', 55 + colWidth * 3, startY + 8);
    doc.text('Non-Medical Vacancies', 55 + colWidth * 4, startY + 8);
    doc.text('Remaining Capacity', 55 + colWidth * 5, startY + 8);

    // Data rows
    let currentY = startY + rowHeight;
    vacancies.forEach((vacancy, index) => {
      const allocated = districtAllocations[vacancy.district] || 0;
      const totalCapacity = (vacancy.medicalVacancies || 0) + (vacancy.commerceVacancies || 0) + (vacancy.nonMedicalVacancies || 0);
      const remaining = totalCapacity - allocated;
      
      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(50, currentY, colWidth * 6, rowHeight).fillAndStroke('#fafafa', '#e5e7eb');
      }
      
      doc.fillColor('#374151');
      doc.text(vacancy.district, 55, currentY + 8);
      doc.text(allocated.toString(), 55 + colWidth, currentY + 8);
      doc.text((vacancy.medicalVacancies || 0).toString(), 55 + colWidth * 2, currentY + 8);
      doc.text((vacancy.commerceVacancies || 0).toString(), 55 + colWidth * 3, currentY + 8);
      doc.text((vacancy.nonMedicalVacancies || 0).toString(), 55 + colWidth * 4, currentY + 8);
      doc.fillColor(remaining > 0 ? '#10b981' : '#ef4444');
      doc.text(remaining.toString(), 55 + colWidth * 5, currentY + 8);
      
      currentY += rowHeight;
    });
  }

  private generateDetailedStudentRecords(doc: any, students: any[]) {
    doc.addPage();
    
    // Header for detailed records
    doc.fontSize(18).fillColor('#1f2937').text('Detailed Student Records', { align: 'center' });
    doc.moveDown();
    
    // Sort students by merit number
    const sortedStudents = students.sort((a, b) => a.meritNumber - b.meritNumber);
    
    // Table setup
    const pageHeight = doc.page.height;
    const startY = 120;
    const rowHeight = 20;
    const colWidths = [60, 120, 80, 80, 200, 120, 80, 80]; // Merit, Name, App No, Stream, Preferences, Allotted District, Allotted Stream, Status
    let currentY = startY;
    
    // Headers
    this.drawTableHeader(doc, currentY, colWidths);
    currentY += rowHeight;
    
    sortedStudents.forEach((student, index) => {
      // Check if we need a new page
      if (currentY > pageHeight - 100) {
        doc.addPage();
        currentY = 50;
        this.drawTableHeader(doc, currentY, colWidths);
        currentY += rowHeight;
      }
      
      this.drawStudentRow(doc, student, currentY, colWidths, index);
      currentY += rowHeight;
    });
  }

  private drawTableHeader(doc: any, y: number, colWidths: number[]) {
    const headers = ['Merit No', 'Name', 'App No', 'Stream', 'Preferences (1-10)', 'Allotted District', 'Allotted Stream', 'Status'];
    let x = 50;
    
    doc.fontSize(9).fillColor('#374151');
    
    headers.forEach((header, i) => {
      doc.rect(x, y, colWidths[i], 20).fillAndStroke('#f1f5f9', '#d1d5db');
      doc.text(header, x + 5, y + 6, { width: colWidths[i] - 10, align: 'left' });
      x += colWidths[i];
    });
  }

  private drawStudentRow(doc: any, student: any, y: number, colWidths: number[], index: number) {
    let x = 50;
    
    // Alternate row colors
    if (index % 2 === 0) {
      doc.rect(x, y, colWidths.reduce((sum, width) => sum + width, 0), 20).fillAndStroke('#fafafa', '#e5e7eb');
    }
    
    doc.fontSize(8).fillColor('#374151');
    
    // Merit Number
    doc.text(student.meritNumber.toString(), x + 5, y + 6, { width: colWidths[0] - 10 });
    x += colWidths[0];
    
    // Name
    doc.text(student.name, x + 5, y + 6, { width: colWidths[1] - 10 });
    x += colWidths[1];
    
    // App Number
    doc.text(student.appNo || '', x + 5, y + 6, { width: colWidths[2] - 10 });
    x += colWidths[2];
    
    // Stream
    doc.text(student.stream, x + 5, y + 6, { width: colWidths[3] - 10 });
    x += colWidths[3];
    
    // Preferences (abbreviated)
    const preferences = [student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
                        student.choice6, student.choice7, student.choice8, student.choice9, student.choice10]
                       .filter(Boolean).join(', ');
    doc.text(preferences || 'No preferences', x + 5, y + 6, { width: colWidths[4] - 10 });
    x += colWidths[4];
    
    // Allotted District
    doc.text(student.allottedDistrict || '-', x + 5, y + 6, { width: colWidths[5] - 10 });
    x += colWidths[5];
    
    // Allotted Stream
    doc.text(student.allottedStream || '-', x + 5, y + 6, { width: colWidths[6] - 10 });
    x += colWidths[6];
    
    // Status with color coding
    const status = student.allocationStatus || 'pending';
    const statusColor = status === 'allotted' ? '#10b981' : status === 'not_allotted' ? '#ef4444' : '#f59e0b';
    doc.fillColor(statusColor);
    doc.text(status.charAt(0).toUpperCase() + status.slice(1), x + 5, y + 6, { width: colWidths[7] - 10 });
  }

  async exportVacanciesAsCSV(): Promise<string> {
    const vacancies = await this.storage.getVacancies();
    const students = await this.storage.getStudents(10000, 0);
    
    // Calculate remaining vacancies by district
    const districtAllocations: { [key: string]: { [key: string]: number } } = {};
    students.filter(s => s.allottedDistrict && s.allottedStream).forEach(student => {
      if (student.allottedDistrict && student.allottedStream) {
        if (!districtAllocations[student.allottedDistrict]) {
          districtAllocations[student.allottedDistrict] = { Medical: 0, Commerce: 0, NonMedical: 0 };
        }
        districtAllocations[student.allottedDistrict][student.allottedStream]++;
      }
    });

    const headers = [
      'District',
      'Medical Vacancies',
      'Medical Allocated', 
      'Medical Remaining',
      'Commerce Vacancies',
      'Commerce Allocated',
      'Commerce Remaining', 
      'Non-Medical Vacancies',
      'Non-Medical Allocated',
      'Non-Medical Remaining',
      'Total Vacancies',
      'Total Allocated',
      'Total Remaining'
    ];

    const rows = vacancies.map(vacancy => {
      const allocated = districtAllocations[vacancy.district] || { Medical: 0, Commerce: 0, NonMedical: 0 };
      const medicalRemaining = (vacancy.medicalVacancies || 0) - allocated.Medical;
      const commerceRemaining = (vacancy.commerceVacancies || 0) - allocated.Commerce;
      const nonMedicalRemaining = (vacancy.nonMedicalVacancies || 0) - allocated.NonMedical;
      const totalVacancies = (vacancy.medicalVacancies || 0) + (vacancy.commerceVacancies || 0) + (vacancy.nonMedicalVacancies || 0);
      const totalAllocated = allocated.Medical + allocated.Commerce + allocated.NonMedical;
      const totalRemaining = totalVacancies - totalAllocated;
      
      return [
        vacancy.district,
        vacancy.medicalVacancies || 0,
        allocated.Medical,
        medicalRemaining,
        vacancy.commerceVacancies || 0, 
        allocated.Commerce,
        commerceRemaining,
        vacancy.nonMedicalVacancies || 0,
        allocated.NonMedical,
        nonMedicalRemaining,
        totalVacancies,
        totalAllocated,
        totalRemaining
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  async exportVacanciesAsPDF(): Promise<Buffer> {
    const vacancies = await this.storage.getVacancies();
    const students = await this.storage.getStudents(10000, 0);
    
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Header
        const currentDate = new Date().toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'long', 
          day: 'numeric'
        });
        
        doc.fontSize(24).fillColor('#2563eb').text('Punjab Seat Allotment System', { align: 'center' });
        doc.fontSize(18).fillColor('#64748b').text('Remaining Vacancies Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).fillColor('#374151').text(`Report Generated: ${currentDate}`, { align: 'center' });
        doc.moveDown(2);

        // Calculate allocations
        const districtAllocations: { [key: string]: { [key: string]: number } } = {};
        students.filter(s => s.allottedDistrict && s.allottedStream).forEach(student => {
          if (student.allottedDistrict && student.allottedStream) {
            if (!districtAllocations[student.allottedDistrict]) {
              districtAllocations[student.allottedDistrict] = { Medical: 0, Commerce: 0, NonMedical: 0 };
            }
            districtAllocations[student.allottedDistrict][student.allottedStream]++;
          }
        });

        // Table headers
        const startY = 150;
        const colWidths = [80, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
        const rowHeight = 25;
        let currentY = startY;
        
        // Header row
        doc.fontSize(8).fillColor('#374151');
        const headers = ['District', 'Med Vac', 'Med Alloc', 'Med Rem', 'Com Vac', 'Com Alloc', 'Com Rem', 'NM Vac', 'NM Alloc', 'NM Rem', 'Total Vac', 'Total Alloc', 'Total Rem'];
        let x = 50;
        headers.forEach((header, i) => {
          doc.rect(x, currentY, colWidths[i], rowHeight).fillAndStroke('#f1f5f9', '#d1d5db');
          doc.text(header, x + 5, currentY + 8, { width: colWidths[i] - 10, align: 'center' });
          x += colWidths[i];
        });
        currentY += rowHeight;

        // Data rows
        vacancies.forEach((vacancy, index) => {
          const allocated = districtAllocations[vacancy.district] || { Medical: 0, Commerce: 0, NonMedical: 0 };
          const medicalRemaining = (vacancy.medicalVacancies || 0) - allocated.Medical;
          const commerceRemaining = (vacancy.commerceVacancies || 0) - allocated.Commerce;
          const nonMedicalRemaining = (vacancy.nonMedicalVacancies || 0) - allocated.NonMedical;
          const totalVacancies = (vacancy.medicalVacancies || 0) + (vacancy.commerceVacancies || 0) + (vacancy.nonMedicalVacancies || 0);
          const totalAllocated = allocated.Medical + allocated.Commerce + allocated.NonMedical;
          const totalRemaining = totalVacancies - totalAllocated;
          
          // Alternate row colors
          if (index % 2 === 0) {
            x = 50;
            doc.rect(x, currentY, colWidths.reduce((sum, width) => sum + width, 0), rowHeight).fillAndStroke('#fafafa', '#e5e7eb');
          }
          
          x = 50;
          const rowData = [
            vacancy.district,
            vacancy.medicalVacancies || 0,
            allocated.Medical,
            medicalRemaining,
            vacancy.commerceVacancies || 0,
            allocated.Commerce,
            commerceRemaining,
            vacancy.nonMedicalVacancies || 0,
            allocated.NonMedical,
            nonMedicalRemaining,
            totalVacancies,
            totalAllocated,
            totalRemaining
          ];
          
          rowData.forEach((data, i) => {
            doc.fillColor('#374151');
            doc.text((data || 0).toString(), x + 5, currentY + 8, { width: colWidths[i] - 10, align: 'center' });
            x += colWidths[i];
          });
          
          currentY += rowHeight;
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async exportFlowDiagramAsPDF(): Promise<Buffer> {
    const districtStatuses = await this.storage.getAllDistrictStatuses();
    const settings = await this.storage.getSettings();
    const allocationFinalized = settings.find(s => s.key === 'allocation_finalized')?.value === 'true';
    const allocationCompleted = settings.find(s => s.key === 'allocation_completed')?.value === 'true';
    const students = await this.storage.getStudents(10000, 0);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        this.generateFlowDiagram(doc, districtStatuses, allocationFinalized, allocationCompleted, students);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private generateFlowDiagram(doc: any, districtStatuses: any[], allocationFinalized: boolean, allocationCompleted: boolean, students: any[]) {
    const currentDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });

    // Header
    doc.fontSize(24).fillColor('#2563eb').text('Punjab Seat Allotment System', { align: 'center' });
    doc.fontSize(18).fillColor('#64748b').text('Allocation Process Flow Diagram', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).fillColor('#374151').text(`Generated: ${currentDate}`, { align: 'center' });
    doc.moveDown(2);

    // Flow Diagram Steps
    const steps = [
      {
        title: "1. Data Upload & Validation",
        description: "Upload student choices, entrance results, and vacancy data",
        status: "complete",
        color: "#10b981"
      },
      {
        title: "2. District Admin Assignment",
        description: "Students assigned to counseling districts with district admins",
        status: "complete", 
        color: "#10b981"
      },
      {
        title: "3. Student Preference Setting",
        description: "District admins set student preferences (10 choices per student)",
        status: "complete",
        color: "#10b981"
      },
      {
        title: "4. Student Locking",
        description: "District admins lock students when preferences are finalized",
        status: "complete",
        color: "#10b981"
      },
      {
        title: "5. District Finalization",
        description: `Districts finalize their data (${districtStatuses.filter(d => d.isFinalized).length}/${districtStatuses.length} completed)`,
        status: districtStatuses.length > 0 && districtStatuses.every(d => d.isFinalized) ? "complete" : "in_progress",
        color: districtStatuses.length > 0 && districtStatuses.every(d => d.isFinalized) ? "#10b981" : "#f59e0b"
      },
      {
        title: "6. Central Allocation Finalization",
        description: "Central admin finalizes allocation process (locks all data)",
        status: allocationFinalized ? "complete" : "pending",
        color: allocationFinalized ? "#10b981" : "#6b7280"
      },
      {
        title: "7. Run Allocation Algorithm", 
        description: "Merit-based seat allocation using student preferences",
        status: allocationCompleted ? "complete" : allocationFinalized ? "ready" : "pending",
        color: allocationCompleted ? "#10b981" : allocationFinalized ? "#3b82f6" : "#6b7280"
      },
      {
        title: "8. Results Export",
        description: "Generate and export allocation results (PDF/CSV)",
        status: allocationCompleted ? "ready" : "pending",
        color: allocationCompleted ? "#3b82f6" : "#6b7280"
      }
    ];

    let currentY = 180;
    const stepHeight = 80;
    const boxWidth = 400;
    const boxHeight = 60;
    const centerX = (doc.page.width - boxWidth) / 2;

    steps.forEach((step, index) => {
      // Draw step box
      doc.rect(centerX, currentY, boxWidth, boxHeight).fillAndStroke(step.color, '#d1d5db');
      
      // Step title
      doc.fontSize(14).fillColor('#ffffff').text(step.title, centerX + 20, currentY + 10, { width: boxWidth - 40 });
      
      // Step description  
      doc.fontSize(10).fillColor('#ffffff').text(step.description, centerX + 20, currentY + 30, { width: boxWidth - 40 });
      
      // Status badge
      const badgeText = step.status.toUpperCase();
      const badgeWidth = 80;
      const badgeX = centerX + boxWidth - badgeWidth - 10;
      doc.rect(badgeX, currentY + 45, badgeWidth, 12).fillAndStroke('#ffffff', '#ffffff');
      doc.fontSize(8).fillColor(step.color).text(badgeText, badgeX + 5, currentY + 47);

      // Draw arrow to next step (except for last step)
      if (index < steps.length - 1) {
        const arrowStartY = currentY + boxHeight;
        const arrowEndY = currentY + stepHeight;
        const arrowX = centerX + boxWidth / 2;
        
        // Arrow line
        doc.moveTo(arrowX, arrowStartY).lineTo(arrowX, arrowEndY - 10).stroke('#6b7280');
        
        // Arrow head
        doc.moveTo(arrowX - 5, arrowEndY - 15)
           .lineTo(arrowX, arrowEndY - 5)
           .lineTo(arrowX + 5, arrowEndY - 15)
           .stroke('#6b7280');
      }

      currentY += stepHeight;
    });

    // Add summary section
    currentY += 30;
    doc.fontSize(16).fillColor('#1f2937').text('Process Summary', { align: 'center' });
    doc.moveDown();

    const lockedStudents = students.filter(s => s.isLocked).length;
    const totalStudents = students.length;

    const summary = [
      `Total Districts: ${districtStatuses.length}`,
      `Finalized Districts: ${districtStatuses.filter(d => d.isFinalized).length}`,
      `Total Students: ${totalStudents}`,
      `Locked Students: ${lockedStudents}`,
      `Allocation Finalized: ${allocationFinalized ? 'Yes' : 'No'}`,
      `Allocation Completed: ${allocationCompleted ? 'Yes' : 'No'}`
    ];

    summary.forEach(item => {
      doc.fontSize(12).fillColor('#374151').text(`• ${item}`, { align: 'center' });
    });
  }
}
