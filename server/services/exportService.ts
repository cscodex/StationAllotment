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
      student.applicationNumber || '',
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

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Title
        doc.fontSize(20).text('Seat Allotment Results', { align: 'center' });
        doc.moveDown();

        // Summary Statistics
        doc.fontSize(14).text('Summary Statistics', { underline: true });
        doc.fontSize(12);
        doc.text(`Total Students: ${stats.totalStudents}`);
        doc.text(`Total Vacancies: ${stats.totalVacancies}`);
        doc.text(`Pending Allocations: ${stats.pendingAllocations}`);
        doc.text(`Completion Rate: ${stats.completionRate}%`);
        doc.moveDown();

        // Allocation Results by Status
        const allottedStudents = students.filter(s => s.allocationStatus === 'allotted');
        const notAllottedStudents = students.filter(s => s.allocationStatus === 'not_allotted');

        doc.fontSize(14).text('Allotted Students', { underline: true });
        doc.fontSize(10);
        
        allottedStudents.forEach(student => {
          doc.text(
            `${student.meritNumber} | ${student.name} | ${student.stream} | ${student.allottedDistrict}`
          );
        });

        if (notAllottedStudents.length > 0) {
          doc.addPage();
          doc.fontSize(14).text('Not Allotted Students', { underline: true });
          doc.fontSize(10);
          
          notAllottedStudents.forEach(student => {
            doc.text(`${student.meritNumber} | ${student.name} | ${student.stream}`);
          });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
