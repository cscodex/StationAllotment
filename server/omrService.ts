import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import { storage } from './storage';
import { SCHOOL_DISTRICTS } from '@shared/schema';

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

        // 3.5. Insert Vertical 1D Barcode (Left Margin)
        const barcodeBuffer = await bwipjs.toBuffer({
            bcid: 'code128',
            text: `${student.id}-${student.appNo}`,
            scale: 3,
            height: 10,
            includetext: true,
            textxalign: 'center',
        });
        const barcodeImage = await doc.embedPng(barcodeBuffer);
        // Rotate 90 degrees to make it vertical, drawn on the left side
        frontPage.drawImage(barcodeImage, {
            x: 50,
            y: height / 2 - 100, // Center roughly
            width: 250,
            height: 50,
            rotate: degrees(90)
        });

        // 4. Instructions
        frontPage.drawText('INSTRUCTIONS: Fill ONE circle per row completely with a dark pen or pencil. Do not use checkmarks.', { x: 60, y: height - 210, size: 10, font: boldFont });

        // 5. Stream Selection Section
        const streamY = height - 250;
        frontPage.drawText('Stream:', { x: 60, y: streamY, size: 11, font: boldFont });

        const streams = ["Medical", "NonMedical", "Commerce"];
        const streamStartX = 140;
        const streamSpacing = 120;

        // Randomly pick a stream if testFillMode is on, otherwise use student's actual stream
        // For blank OMR generation, always leave bubbles blank so students must fill them.
        const randomStreamIdx = testFillMode ? Math.floor(Math.random() * streams.length) : -1;

        for (let s = 0; s < streams.length; s++) {
            const isStreamFilled = testFillMode ? (s === randomStreamIdx) : false;

            frontPage.drawCircle({
                x: streamStartX + s * streamSpacing + 10,
                y: streamY + 4,
                size: 8,
                borderWidth: 1.5,
                borderColor: black,
                color: isStreamFilled ? black : undefined,
            });
            frontPage.drawText(streams[s], { x: streamStartX + s * streamSpacing + 25, y: streamY, size: 10, font });
        }

        // 6. OMR Bubble Grid (10 Choices x 10 Districts)
        const startX = 140;
        const startY = height - 350;
        const rowSpacing = 35;
        const colSpacing = 35;

        const schoolDistricts = [...SCHOOL_DISTRICTS];

        // Prepare shuffled indices for testing mode logic to avoid duplicate choices
        let testIndices: number[] = [];
        if (testFillMode) {
            testIndices = Array.from({ length: schoolDistricts.length }, (_, i) => i);
            for (let i = testIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [testIndices[i], testIndices[j]] = [testIndices[j], testIndices[i]];
            }
        }

        // Add grid bounds around the choices
        frontPage.drawRectangle({
            x: startX - 15,
            y: startY - (9 * rowSpacing) - 15,
            width: (9 * colSpacing) + 50,
            height: (9 * rowSpacing) + 30,
            borderColor: black,
            borderWidth: 1.5
        });

        // Draw Column Headers: "Priority No" heading + numbers 1-10
        frontPage.drawText('Priority No', {
            x: startX - 5,
            y: startY + 55,
            size: 10,
            font: boldFont,
        });
        for (let c = 0; c < 10; c++) {
            frontPage.drawText(`${c + 1}`, {
                x: startX + c * colSpacing + 7,
                y: startY + 30,
                size: 11,
                font: boldFont,
            });
        }

        // Draw Row Labels: District names on the left side
        for (let r = 0; r < schoolDistricts.length; r++) {
            const distName = schoolDistricts[r];
            // Wrap long names: split at space nearest to mid-point if > 10 chars
            if (distName.length > 10) {
                const mid = Math.floor(distName.length / 2);
                let splitIdx = distName.lastIndexOf(' ', mid);
                if (splitIdx <= 0) splitIdx = distName.indexOf(' ', mid);
                if (splitIdx > 0) {
                    const line1 = distName.substring(0, splitIdx);
                    const line2 = distName.substring(splitIdx + 1);
                    frontPage.drawText(line1, { x: 55, y: startY - r * rowSpacing + 4, size: 8, font });
                    frontPage.drawText(line2, { x: 55, y: startY - r * rowSpacing - 6, size: 8, font });
                } else {
                    frontPage.drawText(distName, { x: 55, y: startY - r * rowSpacing - 2, size: 8, font });
                }
            } else {
                frontPage.drawText(distName, { x: 60, y: startY - r * rowSpacing - 4, size: 9, font });
            }
        }

        // Build a mapping: for each district, which priority is it?
        // districtPriority[districtIdx] = priority column (0-based), or -1
        const districtPriority: number[] = new Array(schoolDistricts.length).fill(-1);
        if (testFillMode) {
            // In test mode, assign each district a unique random priority
            for (let i = 0; i < testIndices.length && i < schoolDistricts.length; i++) {
                districtPriority[testIndices[i]] = i; // district testIndices[i] gets priority i
            }
        } else {
            // Map from student's choices
            for (let priority = 0; priority < 10; priority++) {
                const choiceKey = `choice${priority + 1}` as keyof typeof student;
                const choiceVal = student[choiceKey] as string;
                if (choiceVal) {
                    const distIdx = schoolDistricts.indexOf(choiceVal as typeof schoolDistricts[number]);
                    if (distIdx >= 0) {
                        districtPriority[distIdx] = priority;
                    }
                }
            }
        }

        // Draw circles: rows = districts, cols = priority numbers
        for (let r = 0; r < schoolDistricts.length; r++) {
            for (let c = 0; c < 10; c++) {
                const isFilled = districtPriority[r] === c;
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

        // 7. Signatures Section at the Bottom
        const sigY = 70;
        frontPage.drawText('I hereby declare that the preferences filled strictly adhere to my choices.', { x: 60, y: sigY + 50, size: 10, font });

        // Signatures fit exactly in one row
        const sigBoxWidth = 145;
        const sigBoxHeight = 50;
        const boxSpacing = 15;

        // Student Signature
        frontPage.drawRectangle({ x: 60, y: sigY - 20, width: sigBoxWidth, height: sigBoxHeight, borderColor: black, borderWidth: 1 });
        frontPage.drawText('Signature of Candidate', { x: 75, y: sigY - 35, size: 10, font });

        // Parent/Guardian Signature
        frontPage.drawRectangle({ x: 60 + sigBoxWidth + boxSpacing, y: sigY - 20, width: sigBoxWidth, height: sigBoxHeight, borderColor: black, borderWidth: 1 });
        frontPage.drawText('Signature of Parent / Guardian', { x: 60 + sigBoxWidth + boxSpacing + 5, y: sigY - 35, size: 9, font });

        // Verifying Officer Signature
        frontPage.drawRectangle({ x: 60 + 2 * (sigBoxWidth + boxSpacing), y: sigY - 20, width: sigBoxWidth, height: sigBoxHeight, borderColor: black, borderWidth: 1 });
        frontPage.drawText('Signature of Verifying Officer', { x: 60 + 2 * (sigBoxWidth + boxSpacing) + 5, y: sigY - 35, size: 9, font });


        // --- PAGE 2: BACK PAGE (INSTRUCTIONS SIDE) ---
        const backPage = doc.addPage([595.28, 841.89]);

        backPage.drawText('GUIDELINES FOR FILLING STATION ALLOTMENT PREFERENCES', { x: 60, y: height - 100, size: 14, font: boldFont, color: black });

        const instructions = [
            "1. USE BLACK/BLUE BALLPOINT PEN ONLY: All circles must be completely darkened.",
            "2. DO NOT USE TICK MARKS OR CROSSES: Incompletely filled circles will not be read by the scanner.",
            "3. DO NOT FOLD OR CRUMPLE THE SHEET: Folds can damage the fiducial anchors required for scanning.",
            "4. DO NOT WRITE OUTSIDE BUBBLES: Extraneous ink within the bounds of the grid will reject the scan.",
            "5. ONLY ONE CIRCLE PER ROW: Ensure only 1 bubble is shaded per district row (your priority for that district).",
            "6. SIGNATURES REQUIRED: Preferences without Parent/Guardian signatures will be discarded.",
            "7. SUBMIT TO ADMIN: Once drafted, hand this paper document explicitly to the District Admin for optical verification."
        ];

        let instY = height - 150;
        for (const line of instructions) {
            backPage.drawText(line, { x: 60, y: instY, size: 10, font });
            instY -= 25;
        }

        instY -= 20;
        backPage.drawText('EXAMPLES OF HOW TO FILL OPTIONS:', { x: 60, y: instY, size: 12, font: boldFont, color: black });
        instY -= 30;

        // Correct Example
        backPage.drawText('CORRECT METHOD:', { x: 60, y: instY, size: 10, font: boldFont, color: rgb(0, 0.5, 0) });
        backPage.drawCircle({ x: 200, y: instY + 3, size: 8, borderWidth: 1.5, borderColor: black, color: black });
        backPage.drawText('1', { x: 197, y: instY + 15, size: 9, font });
        backPage.drawCircle({ x: 230, y: instY + 3, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawText('2', { x: 227, y: instY + 15, size: 9, font });
        backPage.drawCircle({ x: 260, y: instY + 3, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawText('3', { x: 257, y: instY + 15, size: 9, font });

        instY -= 40;

        // Incorrect Methods
        backPage.drawText('INCORRECT METHODS:', { x: 60, y: instY, size: 10, font: boldFont, color: rgb(0.8, 0, 0) });
        
        // Tick mark
        backPage.drawCircle({ x: 200, y: instY + 3, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawLine({ start: { x: 195, y: instY + 3 }, end: { x: 200, y: instY - 2 }, thickness: 2, color: black });
        backPage.drawLine({ start: { x: 200, y: instY - 2 }, end: { x: 210, y: instY + 10 }, thickness: 2, color: black });
        backPage.drawText('Tick', { x: 190, y: instY - 20, size: 9, font });

        // Cross mark
        backPage.drawCircle({ x: 260, y: instY + 3, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawLine({ start: { x: 254, y: instY - 3 }, end: { x: 266, y: instY + 9 }, thickness: 2, color: black });
        backPage.drawLine({ start: { x: 254, y: instY + 9 }, end: { x: 266, y: instY - 3 }, thickness: 2, color: black });
        backPage.drawText('Cross', { x: 247, y: instY - 20, size: 9, font });

        // Half filled
        backPage.drawCircle({ x: 320, y: instY + 3, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawRectangle({ x: 312, y: instY - 5, width: 8, height: 16, color: black }); // fill left half
        backPage.drawText('Half Filled', { x: 300, y: instY - 20, size: 9, font });

        // Dot
        backPage.drawCircle({ x: 380, y: instY + 3, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawCircle({ x: 380, y: instY + 3, size: 3, color: black });
        backPage.drawText('Dot', { x: 373, y: instY - 20, size: 9, font });

        instY -= 50;
        
        // Example of filling Station Choice
        backPage.drawText('EXAMPLE OF FILLING STATION CHOICES:', { x: 60, y: instY, size: 12, font: boldFont, color: black });
        instY -= 30;

        // Draw a mini grid
        backPage.drawText('Priority No:', { x: 140, y: instY + 20, size: 10, font: boldFont });
        for(let c=0; c<4; c++) {
            backPage.drawText(`${c+1}`, { x: 147 + c * 35, y: instY + 20, size: 11, font: boldFont });
        }
        
        instY -= 15;
        backPage.drawText('1. Amritsar', { x: 60, y: instY - 4, size: 10, font });
        backPage.drawCircle({ x: 152, y: instY, size: 8, borderWidth: 1.5, borderColor: black, color: black }); // priority 1
        backPage.drawCircle({ x: 187, y: instY, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawCircle({ x: 222, y: instY, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawCircle({ x: 257, y: instY, size: 8, borderWidth: 1.5, borderColor: black });

        instY -= 25;
        backPage.drawText('2. Bathinda', { x: 60, y: instY - 4, size: 10, font });
        backPage.drawCircle({ x: 152, y: instY, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawCircle({ x: 187, y: instY, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawCircle({ x: 222, y: instY, size: 8, borderWidth: 1.5, borderColor: black, color: black }); // priority 3
        backPage.drawCircle({ x: 257, y: instY, size: 8, borderWidth: 1.5, borderColor: black });

        instY -= 25;
        backPage.drawText('3. Ludhiana', { x: 60, y: instY - 4, size: 10, font });
        backPage.drawCircle({ x: 152, y: instY, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawCircle({ x: 187, y: instY, size: 8, borderWidth: 1.5, borderColor: black, color: black }); // priority 2
        backPage.drawCircle({ x: 222, y: instY, size: 8, borderWidth: 1.5, borderColor: black });
        backPage.drawCircle({ x: 257, y: instY, size: 8, borderWidth: 1.5, borderColor: black });

        instY += 65; // Back up to draw text block on the right
        backPage.drawText('In this example grid:', { x: 310, y: instY, size: 10, font: boldFont });
        backPage.drawText('1st Preference = Amritsar', { x: 310, y: instY - 20, size: 10, font });
        backPage.drawText('2nd Preference = Ludhiana', { x: 310, y: instY - 40, size: 10, font });
        backPage.drawText('3rd Preference = Bathinda', { x: 310, y: instY - 60, size: 10, font });

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
