import { IStorage } from '../storage';
import PDFDocument from 'pdfkit';

export class ExportService {
  constructor(private storage: IStorage) { }

  private getClosingRanks(students: any[]): Record<string, number> {
    const closingRanks: Record<string, number> = {};
    students.filter(s => s.allocationStatus === 'allotted').forEach(s => {
      const key = `${s.gender}_${s.category}_${s.stream}`;
      if (!closingRanks[key] || (s.meritNumber || 0) > closingRanks[key]) {
        closingRanks[key] = s.meritNumber || 0;
      }
    });
    return closingRanks;
  }

  private getNotAllottedReason(student: any, closingRanks: Record<string, number>): string {
    const key = `${student.gender}_${student.category}_${student.stream}`;
    const rank = closingRanks[key];
    const rankStr = rank ? rank.toString() : 'N/A';
    return `${student.category} for ${student.stream} closed at rank ${rankStr} for Gender:${student.gender} Stream:${student.stream}`;
  }

  async exportResultsAsCSV(): Promise<string> {
    const students = await this.storage.getStudents(10000, 0); // Get all students
    const closingRanks = this.getClosingRanks(students);

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

    const rows = students.map(student => {
      let allottedDistrict = student.allottedDistrict || '';
      if (student.allocationStatus === 'not_allotted') {
        allottedDistrict = this.getNotAllottedReason(student, closingRanks);
      }

      return [
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
        allottedDistrict,
        student.allottedStream || '',
        student.allocationStatus || 'pending'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  async exportCounseledStudentsAsCSV(roundIds: string[]): Promise<string> {
    const students = await this.storage.getStudents(10000, 0);

    const filteredStudents = students.filter(s => 
      s.counselingRoundId && 
      roundIds.includes(s.counselingRoundId) &&
      (s.allocationStatus === 'allotted' || s.allocationStatus === 'not_allotted')
    );

    const headers = [
      'Merit Number',
      'Application Number',
      'Name',
      'Gender',
      'Category',
      'Stream',
      'Preferences (1-10)',
      'Allotted District',
      'Allotted Stream',
      'Status',
      'Counseling Round',
      'Allotment Timestamp'
    ];

    const closingRanks = this.getClosingRanks(students);

    const rows = filteredStudents.map(student => {
      const timestamp = student.updatedAt ? new Date(student.updatedAt).toLocaleString('en-IN') : '-';
      
      let districtText = student.allottedDistrict || '-';
      if (student.allocationStatus === 'not_allotted') {
         districtText = this.getNotAllottedReason(student, closingRanks);
      } else if (student.allocationStatus === 'allotted') {
         const choices = [student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
           student.choice6, student.choice7, student.choice8, student.choice9, student.choice10];
         const choiceIdx = choices.findIndex(c => c === student.allottedDistrict);
         if (choiceIdx !== -1) {
             districtText = `Choice ${choiceIdx + 1} - ${student.allottedDistrict}`;
         }
      }

      return [
        student.meritNumber,
        student.appNo || '-',
        student.name,
        student.gender || '-',
        student.category || '-',
        student.stream,
        [student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
         student.choice6, student.choice7, student.choice8, student.choice9, student.choice10]
          .filter(Boolean).map((c, i) => `${i + 1}. ${c}`).join('; '),
        districtText,
        student.allottedStream || '-',
        student.allocationStatus || '-',
        student.counselingRoundNumber?.toString() || '-',
        timestamp
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
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
        const closingRanks = this.getClosingRanks(students);
        this.generateDetailedStudentRecords(doc, students, closingRanks);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async exportCounseledStudentsAsPDF(roundIds: string[]): Promise<Buffer> {
    const students = await this.storage.getStudents(10000, 0);

    const filteredStudents = students.filter(s => 
      s.counselingRoundId && 
      roundIds.includes(s.counselingRoundId) &&
      (s.allocationStatus === 'allotted' || s.allocationStatus === 'not_allotted')
    );

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });

        doc.fontSize(20).fillColor('#2563eb').text('Punjab Seat Allotment System', { align: 'center' });
        doc.fontSize(14).fillColor('#64748b').text('Counseled Students Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).fillColor('#374151').text(`Rounds Included: ${roundIds.length} | Total Counseled: ${filteredStudents.length}`, { align: 'center' });
        doc.moveDown(2);

        const closingRanks = this.getClosingRanks(students);
        this.generateDetailedStudentRecords(doc, filteredStudents, closingRanks);
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
    const vacatedStudents = students.filter(s => s.allocationStatus === 'vacated');

    this.drawStatsCard(doc, 50, 150, 'Total Candidates', students.length.toString(), '#3b82f6');
    this.drawStatsCard(doc, 200, 150, 'Students Allotted', allottedStudents.length.toString(), '#10b981');
    this.drawStatsCard(doc, 350, 150, 'Students Not Allotted', notAllottedStudents.length.toString(), '#ef4444');
    this.drawStatsCard(doc, 500, 150, 'Vacated Seats', vacatedStudents.length.toString(), '#ef4444');
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
    const districtAllocations: { [key: string]: number } = {};
    students.filter(s => s.allottedDistrict).forEach(student => {
      if (student.allottedDistrict) {
        districtAllocations[student.allottedDistrict] = (districtAllocations[student.allottedDistrict] || 0) + 1;
      }
    });

    const districtTotals: { [key: string]: { medical: number, commerce: number, nonMedical: number, total: number } } = {};
    vacancies.forEach((v: any) => {
      if (!districtTotals[v.district]) districtTotals[v.district] = { medical: 0, commerce: 0, nonMedical: 0, total: 0 };
      if (v.stream === 'Medical') districtTotals[v.district].medical += (v.availableSeats || 0);
      else if (v.stream === 'Commerce') districtTotals[v.district].commerce += (v.availableSeats || 0);
      else if (v.stream === 'NonMedical') districtTotals[v.district].nonMedical += (v.availableSeats || 0);
      districtTotals[v.district].total += (v.availableSeats || 0);
    });

    const docDistricts = Object.keys(districtTotals).sort();

    const startY = 320;
    const colWidth = 120;
    const rowHeight = 25;

    doc.fontSize(10).fillColor('#374151');
    doc.rect(50, startY, colWidth * 6, rowHeight).fillAndStroke('#f1f5f9', '#d1d5db');
    doc.text('District', 55, startY + 8);
    doc.text('Students Allocated', 55 + colWidth, startY + 8);
    doc.text('Medical Vacancies', 55 + colWidth * 2, startY + 8);
    doc.text('Commerce Vacancies', 55 + colWidth * 3, startY + 8);
    doc.text('Non-Medical Vacancies', 55 + colWidth * 4, startY + 8);
    doc.text('Remaining Capacity', 55 + colWidth * 5, startY + 8);

    let currentY = startY + rowHeight;
    docDistricts.forEach((d, index) => {
      const allocated = districtAllocations[d] || 0;
      const t = districtTotals[d];
      const remaining = t.total - allocated;

      if (index % 2 === 0) {
        doc.rect(50, currentY, colWidth * 6, rowHeight).fillAndStroke('#fafafa', '#e5e7eb');
      }

      doc.fillColor('#374151');
      doc.text(d, 55, currentY + 8);
      doc.text(allocated.toString(), 55 + colWidth, currentY + 8);
      doc.text(t.medical.toString(), 55 + colWidth * 2, currentY + 8);
      doc.text(t.commerce.toString(), 55 + colWidth * 3, currentY + 8);
      doc.text(t.nonMedical.toString(), 55 + colWidth * 4, currentY + 8);
      doc.fillColor(remaining > 0 ? '#10b981' : '#ef4444');
      doc.text(remaining.toString(), 55 + colWidth * 5, currentY + 8);

      currentY += rowHeight;
    });
  }

  private generateDetailedStudentRecords(doc: any, students: any[], closingRanks: Record<string, number>) {
    doc.addPage();

    // Header for detailed records
    doc.fontSize(18).fillColor('#1f2937').text('Detailed Student Records', { align: 'center' });
    doc.moveDown();

    // Sort students by gender, then category (WHH > Disabled > Private > Open), then merit number
    const categoryOrder: Record<string, number> = {
      'WHH': 1,
      'Disabled': 2,
      'Private': 3,
      'Open': 4
    };

    const sortedStudents = students.sort((a, b) => {
      // 1. Gender sort
      if (a.gender !== b.gender) {
        return (a.gender || '').localeCompare(b.gender || '');
      }
      // 2. Category sort
      const catA = categoryOrder[a.category] || 99;
      const catB = categoryOrder[b.category] || 99;
      if (catA !== catB) {
        return catA - catB;
      }
      // 3. Merit number
      return (a.meritNumber || 0) - (b.meritNumber || 0);
    });

    // Table setup
    const pageHeight = doc.page.height;
    const startY = 120;
    const rowHeight = 35; // Increased raw height for multi-line preferences
    // Adjusted widths to fit within 780 printable width (landscape A4 with 30 margins)
    const colWidths = [30, 85, 30, 45, 45, 230, 70, 55, 45, 30, 70]; // Merit, Name, Gender, Cat, Stream, Preferences, Allotted District, Allotted Stream, Status, Round, Timestamp
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

      this.drawStudentRow(doc, student, currentY, colWidths, index, closingRanks);
      currentY += rowHeight;
    });
  }

  private drawTableHeader(doc: any, y: number, colWidths: number[]) {
    const headers = ['Merit No', 'Name', 'Gen', 'Cat', 'Stream', 'Preferences (1-10)', 'Allotted Dist.', 'Allotted Stream', 'Status', 'Rnd', 'Timestamp'];
    let x = 50;

    headers.forEach((header, i) => {
      doc.rect(x, y, colWidths[i], 25).fillAndStroke('#1f2937', '#111827');
      doc.fontSize(9).fillColor('#ffffff').text(header, x + 3, y + 8, { width: colWidths[i] - 6, align: 'left' });
      x += colWidths[i];
    });
  }

  private drawStudentRow(doc: any, student: any, y: number, colWidths: number[], index: number, closingRanks: Record<string, number>) {
    let x = 50;
    const rowHeight = 35; // Must match the value in generateDetailedStudentRecords

    // Background color
    if (index % 2 === 0) {
      doc.rect(x, y, colWidths.reduce((sum, width) => sum + width, 0), rowHeight).fillAndStroke('#fafafa', '#e5e7eb');
    } else {
      doc.rect(x, y, colWidths.reduce((sum, width) => sum + width, 0), rowHeight).fillAndStroke('#ffffff', '#e5e7eb');
    }

    // Draw vertical Borders for each cell
    let borderX = x;
    colWidths.forEach((width) => {
      doc.rect(borderX, y, width, rowHeight).stroke('#e5e7eb');
      borderX += width;
    });

    doc.fontSize(7).fillColor('#374151');

    // Merit Number
    doc.text(student.meritNumber.toString(), x + 3, y + 6, { width: colWidths[0] - 6 });
    x += colWidths[0];

    // Name
    doc.text(student.name, x + 3, y + 6, { width: colWidths[1] - 6 });
    x += colWidths[1];

    // Gender
    doc.text(student.gender?.substring(0, 1) || '-', x + 3, y + 6, { width: colWidths[2] - 6 });
    x += colWidths[2];
    
    // Category
    doc.text(student.category || '-', x + 3, y + 6, { width: colWidths[3] - 6 });
    x += colWidths[3];

    // Stream
    doc.text(student.stream, x + 3, y + 6, { width: colWidths[4] - 6 });
    x += colWidths[4];

    // Preferences with numbers
    const choices = [student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
      student.choice6, student.choice7, student.choice8, student.choice9, student.choice10];
    
    const preferences = choices
      .filter(Boolean)
      .map((c, i) => `${i + 1}. ${c}`)
      .join(', ');
      
    doc.fontSize(6); // Smaller font for preferences to fit all 10
    doc.text(preferences || 'No preferences', x + 3, y + 6, { width: colWidths[5] - 6, height: rowHeight - 6, overflow: 'hidden' });
    doc.fontSize(7); // Restore font size
    x += colWidths[5];

    // Allotted District & Reason formatting
    let districtText = student.allottedDistrict || '-';
    if (student.allocationStatus === 'not_allotted') {
       districtText = this.getNotAllottedReason(student, closingRanks);
    } else if (student.allocationStatus === 'allotted') {
       const choiceIdx = choices.findIndex(c => c === student.allottedDistrict);
       if (choiceIdx !== -1) {
           districtText = `Choice ${choiceIdx + 1} - ${student.allottedDistrict}`;
       }
    }

    doc.text(districtText, x + 3, y + 6, { width: colWidths[6] - 6, height: rowHeight - 6, overflow: 'hidden' });
    x += colWidths[6];

    // Allotted Stream
    doc.text(student.allottedStream || '-', x + 3, y + 6, { width: colWidths[7] - 6 });
    x += colWidths[7];

    // Status with color coding
    const status = student.allocationStatus || 'pending';
    const statusColor = status === 'allotted' ? '#10b981' : status === 'not_allotted' ? '#ef4444' : '#f59e0b';
    doc.fillColor(statusColor);
    doc.text(status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '), x + 3, y + 6, { width: colWidths[8] - 6 });
    doc.fillColor('#374151');
    x += colWidths[8];

    // Round
    doc.text(student.counselingRoundNumber?.toString() || '-', x + 3, y + 6, { width: colWidths[9] - 6 });
    x += colWidths[9];
    
    // Timestamp
    const timestamp = student.updatedAt ? new Date(student.updatedAt).toLocaleString('en-IN', {
      year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }) : '-';
    doc.fontSize(6);
    doc.text(timestamp, x + 3, y + 6, { width: colWidths[10] - 6 });
    doc.fontSize(7);
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

    const districtTotals: { [key: string]: { medical: number, commerce: number, nonMedical: number, total: number } } = {};
    vacancies.forEach((v: any) => {
      if (!districtTotals[v.district]) districtTotals[v.district] = { medical: 0, commerce: 0, nonMedical: 0, total: 0 };
      if (v.stream === 'Medical') districtTotals[v.district].medical += (v.availableSeats || 0);
      else if (v.stream === 'Commerce') districtTotals[v.district].commerce += (v.availableSeats || 0);
      else if (v.stream === 'NonMedical') districtTotals[v.district].nonMedical += (v.availableSeats || 0);
      districtTotals[v.district].total += (v.availableSeats || 0);
    });

    const docDistricts = Object.keys(districtTotals).sort();

    const rows = docDistricts.map(d => {
      const t = districtTotals[d];
      const allocated = districtAllocations[d] || { Medical: 0, Commerce: 0, NonMedical: 0 };
      const medicalRemaining = t.medical - allocated.Medical;
      const commerceRemaining = t.commerce - allocated.Commerce;
      const nonMedicalRemaining = t.nonMedical - allocated.NonMedical;
      const totalAllocated = allocated.Medical + allocated.Commerce + allocated.NonMedical;
      const totalRemaining = t.total - totalAllocated;

      return [
        d,
        t.medical,
        allocated.Medical,
        medicalRemaining,
        t.commerce,
        allocated.Commerce,
        commerceRemaining,
        t.nonMedical,
        allocated.NonMedical,
        nonMedicalRemaining,
        t.total,
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

        const districtTotals: { [key: string]: { medical: number, commerce: number, nonMedical: number, total: number } } = {};
        vacancies.forEach((v: any) => {
          if (!districtTotals[v.district]) districtTotals[v.district] = { medical: 0, commerce: 0, nonMedical: 0, total: 0 };
          if (v.stream === 'Medical') districtTotals[v.district].medical += (v.availableSeats || 0);
          else if (v.stream === 'Commerce') districtTotals[v.district].commerce += (v.availableSeats || 0);
          else if (v.stream === 'NonMedical') districtTotals[v.district].nonMedical += (v.availableSeats || 0);
          districtTotals[v.district].total += (v.availableSeats || 0);
        });

        const docDistricts = Object.keys(districtTotals).sort();

        // Data rows
        docDistricts.forEach((d, index) => {
          const t = districtTotals[d];
          const allocated = districtAllocations[d] || { Medical: 0, Commerce: 0, NonMedical: 0 };
          const medicalRemaining = t.medical - allocated.Medical;
          const commerceRemaining = t.commerce - allocated.Commerce;
          const nonMedicalRemaining = t.nonMedical - allocated.NonMedical;
          const totalAllocated = allocated.Medical + allocated.Commerce + allocated.NonMedical;
          const totalRemaining = t.total - totalAllocated;

          // Alternate row colors
          if (index % 2 === 0) {
            x = 50;
            doc.rect(x, currentY, colWidths.reduce((sum, width) => sum + width, 0), rowHeight).fillAndStroke('#fafafa', '#e5e7eb');
          }

          x = 50;
          const rowData = [
            d,
            t.medical,
            allocated.Medical,
            medicalRemaining,
            t.commerce,
            allocated.Commerce,
            commerceRemaining,
            t.nonMedical,
            allocated.NonMedical,
            nonMedicalRemaining,
            t.total,
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
    const currentSessionSetting = await this.storage.getSetting('current_session');
    const academicYear = currentSessionSetting?.value || '2024-2025';
    const activeRound = await this.storage.getActiveCounselingRound(academicYear);

    const districtStatuses = await this.storage.getAllDistrictStatuses(activeRound?.id);
    const allocationFinalized = activeRound?.isAllocationFinalized || false;
    const allocationCompleted = activeRound?.isAllocationCompleted || false;
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
      },
      {
        title: "9. Multi-Round Counseling",
        description: "Manage vacated seats and spawn next iteration rounds",
        status: allocationCompleted ? "ready" : "pending",
        color: allocationCompleted ? "#3b82f6" : "#6b7280"
      },
      {
        title: "10. Session Closing",
        description: "Permanently close and archive the academic session",
        status: "pending",
        color: "#6b7280"
      }
    ];

    let currentY = 150;
    const stepHeight = 62;
    const boxWidth = 400;
    const boxHeight = 45;
    const centerX = (doc.page.width - boxWidth) / 2;

    steps.forEach((step, index) => {
      // Draw step box
      doc.rect(centerX, currentY, boxWidth, boxHeight).fillAndStroke(step.color, '#d1d5db');

      // Step title
      doc.fontSize(12).fillColor('#ffffff').text(step.title, centerX + 15, currentY + 8, { width: boxWidth - 30 });

      // Step description  
      doc.fontSize(9).fillColor('#ffffff').text(step.description, centerX + 15, currentY + 23, { width: boxWidth - 30 });

      // Status badge
      const badgeText = step.status.toUpperCase();
      const badgeWidth = 70;
      const badgeX = centerX + boxWidth - badgeWidth - 10;
      doc.rect(badgeX, currentY + 30, badgeWidth, 10).fillAndStroke('#ffffff', '#ffffff');
      doc.fontSize(7).fillColor(step.color).text(badgeText, badgeX + 4, currentY + 31);

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
      `Vacated Seats: ${students.filter(s => s.allocationStatus === 'vacated').length}`,
      `Allocation Finalized: ${allocationFinalized ? 'Yes' : 'No'}`,
      `Allocation Completed: ${allocationCompleted ? 'Yes' : 'No'}`
    ];

    summary.forEach(item => {
      doc.fontSize(12).fillColor('#374151').text(`• ${item}`, { align: 'center' });
    });
  }

  async exportReportsPDF(academicYear: string, res: any) {
    const students = await this.storage.getStudents(10000, 0, academicYear);
    const vacancies = await this.storage.getVacancies(academicYear);
    const allottedStudents = students.filter(s => s.allocationStatus === 'allotted');

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="counseling-reports-${academicYear || 'all'}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).fillColor('#111827').text(`Counseling Reports Insights - ${academicYear || 'All Time'}`, { align: 'center' }).moveDown(1);

    // 1. Round-wise Insights
    const rounds: Record<string, number> = {};
    allottedStudents.forEach(s => {
      const r = s.counselingRoundNumber || 'Unknown';
      rounds[`Round ${r}`] = (rounds[`Round ${r}`] || 0) + 1;
    });

    doc.fontSize(14).fillColor('#1f2937').text('Round-wise Allotments', { underline: true }).moveDown(0.5);
    doc.fontSize(11).fillColor('#374151');
    if (Object.keys(rounds).length === 0) {
      doc.text("No allotted students found.");
    } else {
      Object.keys(rounds).sort().forEach(round => {
        doc.text(`${round}: ${rounds[round]} students allotted`);
      });
    }
    doc.moveDown(1.5);

    // 2. Category & Gender Breakdown
    doc.fontSize(14).fillColor('#1f2937').text('Category & Gender wise Vacancy Breakdown', { underline: true }).moveDown(0.5);

    const map: Record<string, { district: string, category: string, gender: string, stream: string, total: number, allocated: number }> = {};
    vacancies.forEach(v => {
      if (!v.district || !v.category || !v.gender || !v.stream) return;
      const str = v.stream === 'Non-Medical' ? 'NonMedical' : v.stream;
      const key = `${v.district}-${v.category}-${v.gender}-${str}`;
      if (!map[key]) {
        map[key] = { district: v.district, category: v.category, gender: v.gender, stream: str, total: 0, allocated: 0 };
      }
      map[key].total += (v.totalSeats || 0);
    });

    allottedStudents.forEach(s => {
      if (!s.allottedDistrict || !s.category || !s.gender || !s.stream) return;
      const str = s.stream === 'Non-Medical' ? 'NonMedical' : s.stream;
      const key = `${s.allottedDistrict}-${s.category}-${s.gender}-${str}`;
      if (map[key]) map[key].allocated += 1;
    });

    const breakdown = Object.values(map).sort((a,b) => {
      if (a.district !== b.district) return a.district.localeCompare(b.district);
      if (a.stream !== b.stream) return a.stream.localeCompare(b.stream);
      return a.category.localeCompare(b.category);
    });

    // Draw Table
    let y = doc.y;
    const colWidths = [140, 70, 70, 60, 50, 50, 50];
    const headers = ['District', 'Stream', 'Category', 'Gender', 'Total', 'Filled', 'Remain'];

    const drawBreakdownHeader = (docY: number) => {
      let x = 30;
      headers.forEach((h, i) => {
        doc.rect(x, docY, colWidths[i], 20).fillAndStroke('#1f2937', '#111827');
        doc.fontSize(9).fillColor('#ffffff').text(h, x + 3, docY + 6, { width: colWidths[i] - 6, align: 'left' });
        x += colWidths[i];
      });
      return docY + 20;
    };

    y = drawBreakdownHeader(y);

    doc.fontSize(8);
    breakdown.forEach(row => {
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = drawBreakdownHeader(30);
      }

      let x = 30;
      doc.fontSize(8);
      const texts = [
        row.district, row.stream, row.category, row.gender, 
        row.total.toString(), row.allocated.toString(), (row.total - row.allocated).toString()
      ];

      texts.forEach((text, i) => {
        doc.rect(x, y, colWidths[i], 15).fillAndStroke('#ffffff', '#d1d5db');
        doc.fillColor('#374151').text(text, x + 3, y + 4, { width: colWidths[i] - 6, align: 'left', height: 11 });
        x += colWidths[i];
      });
      y += 15;
    });

    doc.end();
  }

  async exportCustomCSV(academicYear: string, filters: any, columns: string[]): Promise<string> {
    const students = await this.storage.getStudents(10000, 0, academicYear);
    const allotted = students.filter(s => s.allocationStatus === 'allotted');
    
    // Filter by criteria
    const filtered = allotted.filter(s => 
      (!filters.districts?.length || filters.districts.includes(s.allottedDistrict || '')) &&
      (!filters.streams?.length || filters.streams.includes(s.stream)) &&
      (!filters.categories?.length || filters.categories.includes(s.category || '')) &&
      (!filters.genders?.length || filters.genders.includes(s.gender || ''))
    );

    const AVAILABLE_COLUMNS_MAP: Record<string, string> = {
      meritNumber: 'Merit Number',
      appNo: 'App Number',
      name: 'Student Name',
      category: 'Category',
      gender: 'Gender',
      stream: 'Stream',
      choices: 'Choices (1-10)',
      allottedDistrict: 'Allotted District'
    };

    const headers = columns.map(c => AVAILABLE_COLUMNS_MAP[c] || c);

    const rows = filtered.map(student => {
      const rowData: string[] = [];
      columns.forEach(col => {
        if (col === 'meritNumber') rowData.push(student.meritNumber.toString());
        else if (col === 'appNo') rowData.push(student.appNo || '');
        else if (col === 'name') rowData.push(student.name);
        else if (col === 'category') rowData.push(student.category || '');
        else if (col === 'gender') rowData.push(student.gender || '');
        else if (col === 'stream') rowData.push(student.stream);
        else if (col === 'choices') {
          const choices = [student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
            student.choice6, student.choice7, student.choice8, student.choice9, student.choice10]
             .filter(Boolean).map((c, i) => `${i + 1}. ${c}`).join('; ');
          rowData.push(choices);
        }
        else if (col === 'allottedDistrict') rowData.push(student.allottedDistrict || '');
      });
      return rowData;
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  async exportCustomPDF(academicYear: string, filters: any, columns: string[], res: any) {
    const students = await this.storage.getStudents(10000, 0, academicYear);
    const allotted = students.filter(s => s.allocationStatus === 'allotted');
    
    const filtered = allotted.filter(s => 
      (!filters.districts?.length || filters.districts.includes(s.allottedDistrict || '')) &&
      (!filters.streams?.length || filters.streams.includes(s.stream)) &&
      (!filters.categories?.length || filters.categories.includes(s.category || '')) &&
      (!filters.genders?.length || filters.genders.includes(s.gender || ''))
    );

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="custom-allotments-${academicYear || 'all'}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).fillColor('#111827').text(`Custom Filtered Allotment Report`, { align: 'center' }).moveDown(1);
    
    // Group and show summary logic
    const summary: Record<string, number> = {};
    filtered.forEach(s => {
       const key = `${s.allottedDistrict} -> ${s.stream} -> ${s.category} -> ${s.gender}`;
       summary[key] = (summary[key] || 0) + 1;
    });

    doc.fontSize(14).fillColor('#1f2937').text('Summary Counts', { underline: true }).moveDown(0.5);
    doc.fontSize(10).fillColor('#374151');
    doc.text(`Total Students Matching Criteria: ${filtered.length}`).moveDown(0.5);

    Object.keys(summary).sort().forEach(key => {
       doc.text(`${key}: ${summary[key]} allotted`);
    });
    
    doc.moveDown(1.5);
    doc.fontSize(14).fillColor('#1f2937').text('Detailed Student List', { underline: true }).moveDown(0.5);

    // Grouping the items for tables
    const groups: Record<string, any[]> = {};
    filtered.forEach(s => {
       const key = `${s.allottedDistrict} -> ${s.stream} -> ${s.category} -> ${s.gender}`;
       if (!groups[key]) groups[key] = [];
       groups[key].push(s);
    });

    const AVAILABLE_COLUMNS_MAP: Record<string, string> = {
      meritNumber: 'Merit No',
      appNo: 'App No',
      name: 'Name',
      category: 'Cat',
      gender: 'Gen',
      stream: 'Stream',
      choices: 'Choices',
      allottedDistrict: 'Allotted Dist'
    };

    const headers = columns.map(c => AVAILABLE_COLUMNS_MAP[c] || c);
    
    const printableWidth = 780;
    const colWidth = printableWidth / Math.max(columns.length, 1);

    Object.keys(groups).sort().forEach(groupKey => {
       doc.addPage();
       doc.fontSize(12).fillColor('#2563eb').text(`Group: ${groupKey}`, { underline: true }).moveDown(0.5);

       let y = doc.y;
       
       const drawHeader = (docY: number) => {
         let x = 30;
         headers.forEach(h => {
           doc.rect(x, docY, colWidth, 20).fillAndStroke('#1f2937', '#111827');
           doc.fontSize(9).fillColor('#ffffff').text(h, x + 3, docY + 6, { width: colWidth - 6, align: 'left' });
           x += colWidth;
         });
         return docY + 20;
       };

       y = drawHeader(y);

       groups[groupKey].sort((a,b) => a.meritNumber - b.meritNumber).forEach((student, idx) => {
         if (y > doc.page.height - 50) {
           doc.addPage();
           y = drawHeader(30);
         }

         let x = 30;
         doc.fontSize(8);
         
         const rowData: string[] = [];
         columns.forEach(col => {
           if (col === 'meritNumber') rowData.push(student.meritNumber.toString());
           else if (col === 'appNo') rowData.push(student.appNo || '-');
           else if (col === 'name') rowData.push(student.name);
           else if (col === 'category') rowData.push(student.category || '-');
           else if (col === 'gender') rowData.push(student.gender?.substring(0,1) || '-');
           else if (col === 'stream') rowData.push(student.stream);
           else if (col === 'choices') {
             const choices = [student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
               student.choice6, student.choice7, student.choice8, student.choice9, student.choice10]
                .filter(Boolean).map((c, i) => `${i + 1}. ${c}`).join('; ');
             rowData.push(choices || '-');
           }
           else if (col === 'allottedDistrict') rowData.push(student.allottedDistrict || '-');
         });

         rowData.forEach((text, i) => {
           doc.rect(x, y, colWidth, 15).fillAndStroke(idx % 2 === 0 ? '#fafafa' : '#ffffff', '#e5e7eb');
           doc.fillColor('#374151').text(text, x + 3, y + 4, { width: colWidth - 6, align: 'left', height: 11 });
           x += colWidth;
         });
         y += 15;
       });
    });

    doc.end();
  }
}
