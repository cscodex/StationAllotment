import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import { storage } from './storage';

export class OMRService {
    async generateStudentOMRForm(studentId: string, testFillMode = false): Promise<Uint8Array> {
        const student = await storage.getStudent(studentId);
        if (!student) {
            throw new Error("Student not found");
        }

        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

        // --- PAGE 1: FRONT PAGE (SCANNING SIDE) ---
        const frontPage = doc.addPage([595.28, 841.89]); // A4 Size
        const { width, height } = frontPage.getSize();
        const black = rgb(0, 0, 0);

        // 1. Draw 4 Corner Anchor Markers (Fiducials)
        const markerSize = 25;
        const padding = 30;

        // Top-Left
        frontPage.drawRectangle({ x: padding, y: height - padding - markerSize, width: markerSize, height: markerSize, color: black });
        // Top-Right
        frontPage.drawRectangle({ x: width - padding - markerSize, y: height - padding - markerSize, width: markerSize, height: markerSize, color: black });
        // Bottom-Left
        frontPage.drawRectangle({ x: padding, y: padding, width: markerSize, height: markerSize, color: black });
        // Bottom-Right
        frontPage.drawRectangle({ x: width - padding - markerSize, y: padding, width: markerSize, height: markerSize, color: black });

        // 2. Student Info Header
        frontPage.drawText('STATION ALLOTMENT - COUNSELING PREFERENCE FORM', { x: 70, y: height - 60, size: 14, font: boldFont, color: black });
        frontPage.drawText(`Name: ${student.name.toUpperCase()}`, { x: 60, y: height - 100, size: 12, font });
        frontPage.drawText(`Application No: ${student.appNo}`, { x: 60, y: height - 120, size: 12, font });
        frontPage.drawText(`Merit Number: ${student.meritNumber}`, { x: 60, y: height - 140, size: 12, font });
        frontPage.drawText(`Counseling District: ${student.counselingDistrict || 'N/A'}`, { x: 60, y: height - 160, size: 12, font });

        // 3. Insert QR Code
        const qrPayload = JSON.stringify({ id: student.id, appNo: student.appNo, merit: student.meritNumber });
        const qrBase64 = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'H' });
        const qrImage = await doc.embedPng(qrBase64);
        frontPage.drawImage(qrImage, {
            x: width - 140,
            y: height - 170,
            width: 90,
            height: 90
        });

        // 4. Instructions
        frontPage.drawText('INSTRUCTIONS: Fill ONE circle per row completely with a dark pen or pencil. Do not use checkmarks.', { x: 60, y: height - 210, size: 10, font: boldFont });

        // 5. OMR Bubble Grid (10 Choices x 10 Districts)
        const startX = 140;
        const startY = height - 340;
        const rowSpacing = 35;
        const colSpacing = 35;

        const schoolDistricts = [
            "Amritsar", "Bathinda", "Faridkot", "Ferozepur", "Gurdaspur",
            "Jalandhar", "Ludhiana", "Patiala", "Sangrur", "SAS Nagar"
        ];

        // Draw Column Headers (Rotated)
        for (let c = 0; c < schoolDistricts.length; c++) {
            frontPage.drawText(schoolDistricts[c], {
                x: startX + c * colSpacing,
                y: startY + 20,
                size: 10,
                font,
                rotate: degrees(45)
            });
        }

        // Draw 10 Choice Rows Array
        for (let r = 0; r < 10; r++) {
            frontPage.drawText(`Choice ${r + 1}`, { x: 60, y: startY - r * rowSpacing - 4, size: 11, font: boldFont });

            // Randomly select one column to darken if in testing mode
            const randomFilledColumn = testFillMode ? Math.floor(Math.random() * schoolDistricts.length) : -1;

            for (let c = 0; c < schoolDistricts.length; c++) {
                const isFilled = c === randomFilledColumn;

                // Draw circle (hollow by default, solid black if filled)
                frontPage.drawCircle({
                    x: startX + c * colSpacing + 10,
                    y: startY - r * rowSpacing,
                    size: 8,
                    borderWidth: 1.5,
                    borderColor: black,
                    color: isFilled ? black : undefined,
                });
            }
        }

        // 6. Signatures Section at the Bottom
        const sigY = 120;
        frontPage.drawText('I hereby declare that the preferences filled strictly adhere to my choices.', { x: 60, y: sigY + 40, size: 10, font });

        // Student Signature
        frontPage.drawRectangle({ x: 60, y: sigY - 40, width: 200, height: 60, borderColor: black, borderWidth: 1 });
        frontPage.drawText('Signature of Candidate', { x: 90, y: sigY - 55, size: 10, font });

        // Parent/Guardian Signature
        frontPage.drawRectangle({ x: width - 260, y: sigY - 40, width: 200, height: 60, borderColor: black, borderWidth: 1 });
        frontPage.drawText('Signature of Parent / Guardian', { x: width - 240, y: sigY - 55, size: 10, font });

        // Verifying Officer Signature
        frontPage.drawRectangle({ x: (width / 2) - 100, y: sigY - 110, width: 200, height: 50, borderColor: black, borderWidth: 1 });
        frontPage.drawText('Signature of Verifying Officer', { x: (width / 2) - 80, y: sigY - 125, size: 10, font });


        // --- PAGE 2: BACK PAGE (INSTRUCTIONS SIDE) ---
        const backPage = doc.addPage([595.28, 841.89]);

        backPage.drawText('GUIDELINES FOR FILLING STATION ALLOTMENT PREFERENCES', { x: 60, y: height - 100, size: 14, font: boldFont, color: black });

        const instructions = [
            "1. USE BLACK/BLUE BALLPOINT PEN ONLY: All circles must be completely darkened.",
            "2. DO NOT USE TICK MARKS OR CROSSES: Incompletely filled circles will not be read by the scanner.",
            "3. DO NOT FOLD OR CRUMPLE THE SHEET: Folds can damage the fiducial anchors required for scanning.",
            "4. DO NOT WRITE OUTSIDE BUBBLES: Extraneous ink within the bounds of the grid will reject the scan.",
            "5. ONLY ONE CIRCLE PER ROW: Ensure only 1 bubble is shaded per \"Choice 1\" through \"Choice 10\".",
            "6. SIGNATURES REQUIRED: Preferences without Parent/Guardian signatures will be discarded.",
            "7. SUBMIT TO ADMIN: Once drafted, hand this paper document explicitly to the District Admin for optical verification."
        ];

        let instY = height - 150;
        for (const line of instructions) {
            backPage.drawText(line, { x: 60, y: instY, size: 10, font });
            instY -= 25;
        }

        // Convert to Bytes
        return await doc.save();
    }

    async generateBulkOMRForms(studentIds: string[], testFillMode = false): Promise<Uint8Array> {
        const mainDoc = await PDFDocument.create();

        for (const studentId of studentIds) {
            // Generate the standalone 2-page doc for each student
            const singleStudentBytes = await this.generateStudentOMRForm(studentId, testFillMode);
            const studentDoc = await PDFDocument.load(singleStudentBytes);

            // Copy the 2 pages from the student doc into the main doc
            const copiedPages = await mainDoc.copyPages(studentDoc, [0, 1]);
            mainDoc.addPage(copiedPages[0]);
            mainDoc.addPage(copiedPages[1]);
        }

        return await mainDoc.save();
    }
}

export const omrService = new OMRService();
